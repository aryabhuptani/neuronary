-- Recipes added on someone's behalf (no owner, author_url = their X profile) move to their account the first time
-- they sign in with that X account, or link it. The match is on the verified X identity, never on a picked name.
create or replace function public.claim_attributed_recipes(uid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  xh text := public.x_username(uid);
  h text := (select handle::text from public.profiles where id = uid);
  n int;
begin
  if xh is null or h is null then return 0; end if;
  update public.recipes
     set user_id = uid, author_handle = h, author_url = 'https://x.com/' || xh
   where user_id is null and origin = 'site'
     and lower(regexp_replace(coalesce(author_url, ''), '^https://(x|twitter)\.com/([A-Za-z0-9_]+)/?$', '\2')) = lower(xh);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.claim_attributed_recipes(uuid) from public, anon, authenticated;

-- run it whenever an X identity gets attached (sign-up or linking)
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
  perform public.claim_attributed_recipes(uid);
end $$;

-- new X sign-ups: the identity row lands after the user row, and handle_identity_linked fires on it (insert), so
-- sync_x_profile above covers them too.
