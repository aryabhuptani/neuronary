-- jev also vets picked names (slurs hide in compound words a blocklist can't catch). X handles are real accounts and
-- skip this. On "remove" the moderate function renames the account via rename_flagged_handle(); "review" goes to the
-- admin queue.
alter table public.moderation_log drop constraint if exists moderation_log_kind_check;
alter table public.moderation_log add constraint moderation_log_kind_check check (kind in ('comment', 'recipe', 'reproduction', 'profile'));

create or replace function public.profiles_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.x_handle is null then perform public.request_moderation('profile', new.id::text); end if;
  return new;
end $$;
drop trigger if exists profiles_moderate on public.profiles;
create trigger profiles_moderate after insert on public.profiles for each row execute function public.profiles_after_insert();

-- renames a flagged picked name to user_<6 hex>, everywhere it's shown (service role only)
create or replace function public.rename_flagged_handle(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  h text := public.free_handle('user_' || left(md5(uid::text), 6));
begin
  perform set_config('neuronary.trusted_write', 'on', true);
  update public.profiles set handle = h where id = uid and x_handle is null;
  update public.recipes set author_handle = h where user_id = uid;
  update public.comments set author_handle = h where user_id = uid;
  update public.reproductions set author_handle = h where user_id = uid;
  perform set_config('neuronary.trusted_write', 'off', true);
  return h;
end $$;
revoke all on function public.rename_flagged_handle(uuid) from public, anon, authenticated;
