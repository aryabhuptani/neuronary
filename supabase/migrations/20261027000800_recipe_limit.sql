-- Per-user daily recipe limit (default 20, admins unlimited, raise it per user with profiles.recipe_limit).
-- The error names the time the next slot opens, so the site can say "try again at 7:43 pm".
alter table public.profiles add column if not exists recipe_limit int;

-- users can't raise their own limit
create or replace function public.profiles_lock_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_backend() and not public.is_admin() then
    new.recipe_limit := case when tg_op = 'UPDATE' then old.recipe_limit else null end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_lock_limit on public.profiles;
create trigger profiles_lock_limit before insert or update on public.profiles for each row execute function public.profiles_lock_limit();

create or replace function public.recipes_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  lim int;
  next_at timestamptz;
begin
  if public.is_backend() then
    return new;
  end if;
  if auth.uid() is null then raise exception 'sign in to publish'; end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  new.author_url := (select case when x_handle is not null then 'https://x.com/' || x_handle end from public.profiles where id = auth.uid());
  new.origin := 'site';
  new.repo_hash := null;
  new.hidden := false;
  new.created_at := now();
  new.updated_at := now();
  new.date := current_date;
  if not public.is_admin() then
    lim := coalesce((select recipe_limit from public.profiles where id = auth.uid()), 20);
    select count(*) into n from public.recipes where user_id = auth.uid() and created_at > now() - interval '1 day';
    if n >= lim then
      select created_at + interval '1 day' into next_at from public.recipes
        where user_id = auth.uid() and created_at > now() - interval '1 day'
        order by created_at desc offset greatest(lim - 1, 0) limit 1;
      raise exception 'rate limit: % recipes a day%', lim,
        coalesce('; next one at ' || to_char(next_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '');
    end if;
  end if;
  return new;
end $$;
