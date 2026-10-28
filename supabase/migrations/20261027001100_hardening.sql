-- Hardening from the code review:
-- 1. the daily limit counts publishes in a log (deleting doesn't free a slot), is taken under a per-user lock (no
--    parallel overshoot), and also applies to API inserts made with the service role
-- 2. names/descriptions are trimmed before the length checks; example text gets a search column
-- 3. votes and reproductions need a verified (non-anonymous) account; reproductions record a result and setup

-- ------------------------------------------------------------------ 1. limit
create table if not exists public.publish_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists publish_log_user_time on public.publish_log (user_id, created_at);
alter table public.publish_log enable row level security; -- no policies: only definer functions touch it

-- backfill the last day from existing recipes
insert into public.publish_log (user_id, created_at)
select user_id, created_at from public.recipes
where user_id is not null and created_at > now() - interval '1 day'
  and not exists (select 1 from public.publish_log l where l.user_id = recipes.user_id);

create or replace function public.recipe_quota_for(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  lim int;
  used int;
  next_at timestamptz;
begin
  select is_admin, trusted, recipe_limit into p from public.profiles where id = uid;
  if coalesce(p.is_admin, false) then return json_build_object('limit', null, 'used', 0, 'next_at', null); end if;
  lim := coalesce(p.recipe_limit, case when coalesce(p.trusted, false) then 200 else 20 end);
  select count(*) into used from public.publish_log where user_id = uid and created_at > now() - interval '1 day';
  if used >= lim then
    select created_at + interval '1 day' into next_at from public.publish_log
      where user_id = uid and created_at > now() - interval '1 day'
      order by created_at desc offset greatest(lim - 1, 0) limit 1;
  end if;
  return json_build_object('limit', lim, 'used', used, 'next_at', next_at);
end $$;

-- takes the slot: locks the user, checks, logs. Raises the readable error when out of slots.
create or replace function public.take_recipe_slot(uid uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  q json;
begin
  perform pg_advisory_xact_lock(hashtext('recipe-slot:' || uid::text));
  q := public.recipe_quota_for(uid);
  if (q ->> 'limit') is not null and (q ->> 'used')::int >= (q ->> 'limit')::int then
    raise exception 'rate limit: % recipes a day%', q ->> 'limit',
      coalesce('; next one at ' || to_char((q ->> 'next_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '');
  end if;
  insert into public.publish_log (user_id) values (uid);
end $$;
revoke all on function public.take_recipe_slot(uuid) from public, anon, authenticated;

create or replace function public.recipes_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then
    -- API posts arrive as the service role on a user's behalf: same limit. Repo syncs have no user.
    if new.origin = 'site' and new.user_id is not null then perform public.take_recipe_slot(new.user_id); end if;
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
  perform public.take_recipe_slot(auth.uid());
  return new;
end $$;

-- ------------------------------------------------------------------ 2. trimming + search text
alter table public.recipes add column if not exists search_text text;

create or replace function public.recipes_tidy() returns trigger
language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name);
  new.description := btrim(new.description);
  if new.notes is not null then new.notes := nullif(btrim(new.notes), ''); end if;
  new.search_text := left(lower(coalesce((
    select string_agg(coalesce(e ->> 'prompt', '') || ' ' || coalesce(e ->> 'output', ''), ' ')
    from jsonb_array_elements(case when jsonb_typeof(new.examples) = 'array' then new.examples else '[]'::jsonb end) e), '')), 3000);
  return new;
end $$;
drop trigger if exists recipes_aac_tidy on public.recipes;
create trigger recipes_aac_tidy before insert or update on public.recipes for each row execute function public.recipes_tidy();

-- the raw columns can't be padded past the limits either
alter table public.recipes drop constraint if exists recipes_name_len;
alter table public.recipes add constraint recipes_name_len check (length(name) <= 80) not valid;
alter table public.recipes drop constraint if exists recipes_description_len;
alter table public.recipes add constraint recipes_description_len check (length(description) <= 600) not valid;
alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments add constraint comments_body_len check (length(body) <= 4000) not valid;

update public.recipes set name = name; -- fills search_text and trims existing rows

-- ------------------------------------------------------------------ 3. verified accounts for votes and reproductions
create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not is_anonymous from auth.users where id = auth.uid()), false)
$$;

drop policy if exists "cast vote" on public.votes;
create policy "cast vote" on public.votes for insert to authenticated with check (user_id = auth.uid() and public.is_verified());
drop policy if exists "change vote" on public.votes;
create policy "change vote" on public.votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified());

alter table public.reproductions add column if not exists result text not null default 'yes' check (result in ('yes', 'partial', 'no'));
alter table public.reproductions add column if not exists setup text check (setup is null or length(setup) <= 200);

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
  if n >= 30 then raise exception 'rate limit: 30 reproductions an hour'; end if;
  return new;
end $$;

-- stats: reproductions = worked; plus partial and failed counts. Hidden recipes and drafts aren't counted anywhere public.
create or replace view public.recipe_stats with (security_invoker = false) as
select r.id as recipe_id,
       coalesce(v.score, 0)::int as score,
       coalesce(v.ups, 0)::int as ups,
       coalesce(v.downs, 0)::int as downs,
       coalesce(c.n, 0)::int as comments,
       coalesce(p.yes, 0)::int as reproductions,
       coalesce(p.partial, 0)::int as repro_partial,
       coalesce(p.no, 0)::int as repro_failed
from public.recipes r
left join (select recipe_id, sum(value) as score, count(*) filter (where value > 0) as ups,
                  count(*) filter (where value < 0) as downs
           from public.votes group by recipe_id) v on v.recipe_id = r.id
left join (select recipe_id, count(*) as n from public.comments where not hidden group by recipe_id) c on c.recipe_id = r.id
left join (select recipe_id, count(*) filter (where result = 'yes') as yes, count(*) filter (where result = 'partial') as partial,
                  count(*) filter (where result = 'no') as no
           from public.reproductions where not hidden group by recipe_id) p on p.recipe_id = r.id;
