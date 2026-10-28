-- Security fixes from review:
-- 1. x_handle comes only from a linked X identity (auth.identities), never from user-editable metadata; admin is by
--    account, not by handle (the owner trigger is gone; existing admins keep the flag)
-- 2. examples/sampling/method are type-checked (example "scale" was rendered as HTML and never validated)
-- 3. edits to site recipes and reproductions go back through moderation

-- ------------------------------------------------------------------ 1. identities
drop trigger if exists profiles_owner_admin on public.profiles;
drop function if exists public.profiles_owner_admin();

-- the X username of a user's linked X identity, or null
create or replace function public.x_username(uid uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(i.identity_data ->> 'user_name', i.identity_data ->> 'preferred_username')
  from auth.identities i where i.user_id = uid and i.provider in ('x', 'twitter')
  order by i.created_at limit 1
$$;
revoke all on function public.x_username(uuid) from public, anon, authenticated;

create or replace function public.x_avatar(uid uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select public.provider_avatar(i.identity_data)
  from auth.identities i where i.user_id = uid and i.provider in ('x', 'twitter')
  order by i.created_at limit 1
$$;
revoke all on function public.x_avatar(uuid) from public, anon, authenticated;

-- sign-up: profiles come from the X identity (OAuth sign-ups); anonymous users pick a handle with claim_handle()
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := coalesce(m ->> 'user_name', m ->> 'preferred_username');
begin
  -- raw_app_meta_data is server-set; at OAuth sign-up the user metadata comes straight from the provider
  if coalesce(new.is_anonymous, false) or uname is null or coalesce(new.raw_app_meta_data ->> 'provider', '') not in ('twitter', 'x') then
    return new;
  end if;
  insert into public.profiles (id, handle, x_handle, avatar_url)
  values (new.id, public.free_handle(uname), uname, public.provider_avatar(m))
  on conflict (id) do nothing;
  return new;
end $$;

-- later changes (linking X to an anonymous account, avatar refresh): read the identity, not the editable metadata
create or replace function public.sync_x_profile(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uname text := public.x_username(uid);
begin
  if uname is null then return; end if;
  insert into public.profiles (id, handle, x_handle, avatar_url) values (uid, public.free_handle(uname), uname, public.x_avatar(uid))
  on conflict (id) do update set
    x_handle = coalesce(public.profiles.x_handle, excluded.x_handle),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
end $$;
revoke all on function public.sync_x_profile(uuid) from public, anon, authenticated;

create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_x_profile(new.id);
  return new;
end $$;

create or replace function public.handle_identity_linked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.provider in ('x', 'twitter') then perform public.sync_x_profile(new.user_id); end if;
  return new;
end $$;
drop trigger if exists on_identity_linked on auth.identities;
create trigger on_identity_linked after insert or update on auth.identities
  for each row execute function public.handle_identity_linked();

-- any x_handle that doesn't match a linked identity is cleared
update public.profiles p set x_handle = null where x_handle is not null and x_handle is distinct from public.x_username(p.id);

-- ------------------------------------------------------------------ 2. types
create or replace function public.valid_examples(ex jsonb, min_n int) returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
begin
  if jsonb_typeof(ex) <> 'array' or jsonb_array_length(ex) not between min_n and 12 then return false; end if;
  for e in select * from jsonb_array_elements(ex) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(e) x where x not in ('prompt', 'output', 'base_output', 'scale', 'generation')) then return false; end if;
    if jsonb_typeof(e -> 'prompt') <> 'string' or jsonb_typeof(e -> 'output') <> 'string' then return false; end if;
    if e ? 'base_output' and jsonb_typeof(e -> 'base_output') <> 'string' then return false; end if;
    if e ? 'scale' and (jsonb_typeof(e -> 'scale') <> 'number' or abs((e ->> 'scale')::numeric) > 100) then return false; end if;
    if e ? 'generation' and jsonb_typeof(e -> 'generation') <> 'object' then return false; end if;
    if length(btrim(e ->> 'prompt')) = 0 or length(btrim(e ->> 'output')) = 0 then return false; end if;
    if length(e ->> 'prompt') > 4000 or length(e ->> 'output') > 8000 or length(coalesce(e ->> 'base_output', '')) > 8000 then return false; end if;
  end loop;
  return true;
end $$;

-- sampling: known keys, numbers (thinking: boolean)
create or replace function public.valid_sampling(s jsonb) returns boolean
language sql immutable as $$
  select s is null or (jsonb_typeof(s) = 'object' and not exists (
    select 1 from jsonb_each(s) kv
    where kv.key not in ('temperature', 'top_p', 'top_k', 'min_p', 'repetition_penalty', 'max_new_tokens', 'thinking')
       or (kv.key = 'thinking' and jsonb_typeof(kv.value) <> 'boolean')
       or (kv.key <> 'thinking' and (jsonb_typeof(kv.value) <> 'number' or abs((kv.value #>> '{}')::numeric) > 100000))))
$$;
-- method: known keys with known values
create or replace function public.valid_method(m jsonb) returns boolean
language sql immutable as $$
  select m is null or (jsonb_typeof(m) = 'object'
    and not exists (select 1 from jsonb_object_keys(m) k where k not in ('op', 'apply_to', 'normalization', 'site'))
    and coalesce(m ->> 'op', 'add') in ('add', 'mul')
    and coalesce(m ->> 'apply_to', 'all_tokens') in ('all_tokens', 'prompt', 'generation', 'last_token')
    and coalesce(m ->> 'normalization', 'median_resid') ~ '^[a-z0-9_]{1,60}$'
    and coalesce(m ->> 'site', 'mlp.down_proj.input') ~ '^[a-z0-9_.]{1,60}$')
$$;
alter table public.recipes drop constraint if exists recipes_sampling_ok;
alter table public.recipes add constraint recipes_sampling_ok check (public.valid_sampling(sampling));
alter table public.recipes drop constraint if exists recipes_method_ok;
alter table public.recipes add constraint recipes_method_ok check (public.valid_method(method));

-- ------------------------------------------------------------------ 3. re-moderation on edits
create or replace function public.recipes_after_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origin = 'site' and not new.draft and not old.draft and (
       new.name is distinct from old.name or new.description is distinct from old.description
    or new.tags is distinct from old.tags or new.examples is distinct from old.examples
    or new.notes is distinct from old.notes or new.source is distinct from old.source
    or new.aliases is distinct from old.aliases or new.dose_curve is distinct from old.dose_curve) then
    perform public.request_moderation('recipe', new.id);
  end if;
  return new;
end $$;
drop trigger if exists recipes_moderate_edit on public.recipes;
create trigger recipes_moderate_edit after update on public.recipes for each row execute function public.recipes_after_edit();

create or replace function public.reproductions_after_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.output is distinct from old.output or new.prompt is distinct from old.prompt
     or new.note is distinct from old.note or new.setup is distinct from old.setup then
    perform public.request_moderation('reproduction', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists reproductions_moderate_edit on public.reproductions;
create trigger reproductions_moderate_edit after update on public.reproductions for each row execute function public.reproductions_after_edit();

-- "verified" = a linked X account (or a trusted publisher / admin). Email sign-up is disabled in the auth config;
-- non-anonymous alone isn't enough.
create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and (
    exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider in ('x', 'twitter'))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.trusted or p.is_admin)))
$$;

create or replace function public.create_api_token(token_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  raw text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_verified() then
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
