-- 1. jev can hold a post for human review (hidden until an admin approves).
-- 2. API tokens need a verified (non-anonymous) account, so agents can't post from throwaway sessions.
alter table public.moderation_log drop constraint if exists moderation_log_verdict_check;
alter table public.moderation_log add constraint moderation_log_verdict_check check (verdict in ('allow', 'review', 'remove'));
alter table public.moderation_log add column if not exists resolved_at timestamptz;

create or replace function public.create_api_token(token_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  raw text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce((select is_anonymous from auth.users where id = auth.uid()), true) then
    raise exception 'API tokens need a verified account: sign in with Twitter (you can link it from the account menu)';
  end if;
  if public.my_handle() is null then raise exception 'pick a handle first'; end if;
  if (select count(*) from public.api_tokens where user_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception 'at most 10 active tokens; revoke one first';
  end if;
  raw := 'nry_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_tokens (user_id, name, token_hash, prefix)
  values (auth.uid(), btrim(token_name), encode(extensions.digest(raw, 'sha256'), 'hex'), left(raw, 10));
  return raw;
end $$;

-- admins mark review items handled
create policy "admins resolve moderation log" on public.moderation_log for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
