-- Limits are backstops, set where nobody normal will ever feel them; tighten only where real abuse shows up.
-- Launch-night peaks: 83 recipes/day (one account), 11 reproductions/hour (an agent sweep), 1 comment/hour.
-- recipes/day: picked name 200, X-verified 1000, trusted 10000 (imports of a few hundred just work)
create or replace function public.recipe_quota_for(uid uuid) returns json
language plpgsql stable security definer set search_path = public, auth as $$
declare
  p record;
  lim int;
  used int;
  next_at timestamptz;
begin
  select is_admin, trusted, recipe_limit into p from public.profiles where id = uid;
  if coalesce(p.is_admin, false) then return json_build_object('limit', null, 'used', 0, 'next_at', null); end if;
  lim := coalesce(p.recipe_limit, case
    when coalesce(p.trusted, false) then 10000
    when exists (select 1 from auth.identities i where i.user_id = uid and i.provider in ('x', 'twitter')) then 1000
    else 200 end);
  select count(*) into used from public.publish_log where user_id = uid and created_at > now() - interval '1 day';
  if used >= lim then
    select created_at + interval '1 day' into next_at from public.publish_log
      where user_id = uid and created_at > now() - interval '1 day'
      order by created_at desc offset greatest(lim - 1, 0) limit 1;
  end if;
  return json_build_object('limit', lim, 'used', used, 'next_at', next_at);
end $$;

-- comments: 300 an hour
create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if public.is_backend() then return new; end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  new.hidden := false;
  new.created_at := now();
  if new.parent_id is not null and not exists (
      select 1 from public.comments p where p.id = new.parent_id and p.recipe_id = new.recipe_id and p.parent_id is null) then
    raise exception 'replies go one level deep, on the same recipe';
  end if;
  select count(*) into n from public.comments where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if n >= 300 then raise exception 'rate limit: 300 comments an hour'; end if;
  return new;
end $$;

-- reproductions: 500 an hour (an agent re-testing the whole site is a normal thing to do)
create or replace function public.reproductions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if public.is_backend() then return new; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_verified() then raise exception 'reproductions need a verified account: sign in with Twitter (you can link it from the account menu)'; end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  if exists (select 1 from public.recipes r where r.id = new.recipe_id and r.user_id = auth.uid()) then
    raise exception 'reproductions are for other people''s recipes; add an example to your own instead';
  end if;
  new.hidden := false;
  new.created_at := now();
  select count(*) into n from public.reproductions where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if n >= 500 then raise exception 'rate limit: 500 reproductions an hour'; end if;
  return new;
end $$;
