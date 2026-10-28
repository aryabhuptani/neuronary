-- Flagged usernames, visible to their owner: name_status 'review' (jev or an admin wants a look) or 'renamed' (removed
-- and replaced with user_xxxxxx). The owner sees it in their account menu and can pick a new name with change_handle();
-- admins approve or rename from the moderation queue with resolve_name().
alter table public.profiles add column if not exists name_status text check (name_status in ('review', 'renamed'));

-- users can't clear their own flag by writing the column
create or replace function public.profiles_lock_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_backend() and not public.is_admin() then
    new.recipe_limit := case when tg_op = 'UPDATE' then old.recipe_limit else null end;
    new.trusted := case when tg_op = 'UPDATE' then old.trusted else false end;
    new.name_status := case when tg_op = 'UPDATE' then old.name_status else null end;
  end if;
  return new;
end $$;

-- renames everywhere the handle is shown (definer helper; caller checks rights)
create or replace function public.set_handle_everywhere(uid uuid, h text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set handle = h where id = uid;
  update public.recipes set author_handle = h where user_id = uid;
  update public.comments set author_handle = h where user_id = uid;
  update public.reproductions set author_handle = h where user_id = uid;
  perform set_config('neuronary.trusted_write', 'off', true);
end $$;
revoke all on function public.set_handle_everywhere(uuid, text) from public, anon, authenticated;

create or replace function public.rename_flagged_handle(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  h text := public.free_handle('user_' || left(md5(uid::text), 6));
begin
  perform public.set_handle_everywhere(uid, h);
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set name_status = 'renamed' where id = uid;
  perform set_config('neuronary.trusted_write', 'off', true);
  return h;
end $$;
revoke all on function public.rename_flagged_handle(uuid) from public, anon, authenticated;

-- jev's "review" on a username marks it for the owner too (called by the moderate function)
create or replace function public.flag_handle(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set name_status = 'review' where id = uid and x_handle is null;
  perform set_config('neuronary.trusted_write', 'off', true);
end $$;
revoke all on function public.flag_handle(uuid) from public, anon, authenticated;

-- the owner of a flagged name picks a new one; it goes back through jev
create or replace function public.change_handle(h text) returns text
language plpgsql security definer set search_path = public as $$
declare
  st text := (select name_status from public.profiles where id = auth.uid());
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if st is null then raise exception 'your name isn''t flagged, so it can''t be changed here'; end if;
  if h !~ '^[A-Za-z0-9_]{2,24}$' then raise exception 'bad handle: 2-24 letters, digits or _'; end if;
  if public.handle_is_blocked(h) then raise exception 'pick a different name'; end if;
  if exists (select 1 from public.profiles where handle = h and id <> auth.uid()) then raise exception 'handle taken'; end if;
  perform public.set_handle_everywhere(auth.uid(), h);
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set name_status = null where id = auth.uid();
  perform set_config('neuronary.trusted_write', 'off', true);
  update public.moderation_log set resolved_at = now() where kind = 'profile' and target_id = auth.uid()::text and resolved_at is null;
  perform public.request_moderation('profile', auth.uid()::text);
  return h;
end $$;
revoke all on function public.change_handle(text) from public, anon;
grant execute on function public.change_handle(text) to authenticated;

-- admins: approve a flagged name (clears the flag) or rename it to user_xxxxxx
create or replace function public.resolve_name(uid uuid, action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  h text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if action = 'approve' then
    perform set_config('neuronary.trusted_write', 'on', true);
    update public.profiles set name_status = null where id = uid returning handle into h;
    perform set_config('neuronary.trusted_write', 'off', true);
  elsif action = 'rename' then
    h := public.rename_flagged_handle(uid);
  else
    raise exception 'action is approve or rename';
  end if;
  update public.moderation_log set resolved_at = now() where kind = 'profile' and target_id = uid::text and resolved_at is null;
  return h;
end $$;
revoke all on function public.resolve_name(uuid, text) from public, anon;
grant execute on function public.resolve_name(uuid, text) to authenticated;

-- the name already waiting
update public.profiles p set name_status = 'review'
where exists (select 1 from public.moderation_log l where l.kind = 'profile' and l.verdict = 'review' and l.resolved_at is null and l.target_id = p.id::text);
