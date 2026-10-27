-- Personal API tokens, so agents (Claude via MCP, the neuron explorer, scripts) can act as a user.
-- Only a sha256 of each token is stored; the plaintext is returned once by create_api_token().
create table if not exists public.api_tokens (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  token_hash   text not null unique,
  prefix       text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_tokens_user on public.api_tokens (user_id);
alter table public.api_tokens enable row level security;
create policy "see own tokens" on public.api_tokens for select to authenticated using (user_id = auth.uid());

create or replace function public.create_api_token(token_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  raw text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.my_handle() is null then raise exception 'pick a handle first'; end if;
  if (select count(*) from public.api_tokens where user_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception 'at most 10 active tokens; revoke one first';
  end if;
  raw := 'nry_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_tokens (user_id, name, token_hash, prefix)
  values (auth.uid(), btrim(token_name), encode(extensions.digest(raw, 'sha256'), 'hex'), left(raw, 10));
  return raw;
end $$;

create or replace function public.revoke_api_token(token_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.api_tokens set revoked_at = now() where id = token_id and user_id = auth.uid() and revoked_at is null;
$$;

-- service only: token -> user id (null if unknown or revoked); records last use
create or replace function public.resolve_api_token(raw text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
begin
  update public.api_tokens set last_used_at = now()
  where token_hash = encode(extensions.digest(raw, 'sha256'), 'hex') and revoked_at is null
  returning user_id into uid;
  return uid;
end $$;
revoke execute on function public.resolve_api_token(text) from public, anon, authenticated;
