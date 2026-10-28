-- Strikes: every post jev removes counts against its author. At 3 the account can't post (recipes, comments,
-- reproductions) until an admin clears it, so a spam script stops costing moderation calls after its third slur.
alter table public.profiles add column if not exists strikes int not null default 0;

create or replace function public.add_strike(uid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set strikes = strikes + 1 where id = uid returning strikes into n;
  perform set_config('neuronary.trusted_write', 'off', true);
  return n;
end $$;
revoke all on function public.add_strike(uuid) from public, anon, authenticated;

create or replace function public.check_not_struck(uid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select strikes from public.profiles where id = uid), 0) >= 3 then
    raise exception 'posting is paused on this account: several of its posts were removed by moderation';
  end if;
end $$;
revoke all on function public.check_not_struck(uuid) from public, anon, authenticated;

-- users can't reset their own strikes
create or replace function public.profiles_lock_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_backend() and not public.is_admin() then
    new.recipe_limit := case when tg_op = 'UPDATE' then old.recipe_limit else null end;
    new.trusted := case when tg_op = 'UPDATE' then old.trusted else false end;
    new.name_status := case when tg_op = 'UPDATE' then old.name_status else null end;
    new.strikes := case when tg_op = 'UPDATE' then old.strikes else 0 end;
  end if;
  return new;
end $$;

-- one trigger in front of every kind of post; also covers API posts (service role, user_id set)
create or replace function public.posts_not_struck() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.user_id, auth.uid()) is not null then perform public.check_not_struck(coalesce(new.user_id, auth.uid())); end if;
  return new;
end $$;
drop trigger if exists recipes_aad_strikes on public.recipes;
create trigger recipes_aad_strikes before insert on public.recipes for each row execute function public.posts_not_struck();
drop trigger if exists comments_aad_strikes on public.comments;
create trigger comments_aad_strikes before insert on public.comments for each row execute function public.posts_not_struck();
drop trigger if exists reproductions_aad_strikes on public.reproductions;
create trigger reproductions_aad_strikes before insert on public.reproductions for each row execute function public.posts_not_struck();
