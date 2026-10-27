-- Profile pictures from the sign-in provider (X sends avatar_url). Refreshed whenever the provider metadata changes,
-- which happens on each OAuth sign-in. X's "_normal" size is 48px; ask for 200px.
alter table public.profiles add column if not exists avatar_url text;

create or replace function public.provider_avatar(m jsonb) returns text
language sql immutable as $$
  select nullif(regexp_replace(coalesce(m ->> 'avatar_url', m ->> 'picture', ''), '_normal\.', '_200x200.'), '')
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := coalesce(m ->> 'user_name', m ->> 'preferred_username');
begin
  if coalesce(new.is_anonymous, false) or uname is null then
    return new;
  end if;
  insert into public.profiles (id, handle, x_handle, avatar_url)
  values (new.id, public.free_handle(uname),
          case when new.raw_app_meta_data ->> 'provider' in ('twitter', 'x') then uname end,
          public.provider_avatar(m))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := coalesce(m ->> 'user_name', m ->> 'preferred_username');
begin
  if uname is not null then
    insert into public.profiles (id, handle, x_handle, avatar_url) values (new.id, public.free_handle(uname), uname, public.provider_avatar(m))
    on conflict (id) do update set
      x_handle = coalesce(public.profiles.x_handle, excluded.x_handle),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  end if;
  return new;
end $$;

update public.profiles p set avatar_url = public.provider_avatar(u.raw_user_meta_data)
from auth.users u where u.id = p.id and p.avatar_url is null;
