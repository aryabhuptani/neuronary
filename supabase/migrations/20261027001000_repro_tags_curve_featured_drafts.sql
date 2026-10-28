-- 1. reproductions ("I reproduced it", with a sample)   2. tag aliases + admin merge   3. dose curves
-- 4. featured recipes   5. drafts   6. trusted publishers (higher limit, marked name)

-- ------------------------------------------------------------------ 6. trusted publishers + one quota function
alter table public.profiles add column if not exists trusted boolean not null default false;

create or replace function public.profiles_lock_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_backend() and not public.is_admin() then
    new.recipe_limit := case when tg_op = 'UPDATE' then old.recipe_limit else null end;
    new.trusted := case when tg_op = 'UPDATE' then old.trusted else false end;
  end if;
  return new;
end $$;

-- {limit, used, next_at} for any user (limit null = unlimited). Used by the site (my_recipe_quota), the insert
-- trigger and the API, so all three agree.
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
  select count(*) into used from public.recipes where user_id = uid and created_at > now() - interval '1 day';
  if used >= lim then
    select created_at + interval '1 day' into next_at from public.recipes
      where user_id = uid and created_at > now() - interval '1 day'
      order by created_at desc offset greatest(lim - 1, 0) limit 1;
  end if;
  return json_build_object('limit', lim, 'used', used, 'next_at', next_at);
end $$;
revoke all on function public.recipe_quota_for(uuid) from public, anon, authenticated;

create or replace function public.my_recipe_quota() returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else public.recipe_quota_for(auth.uid()) end
$$;

-- raises the readable limit error if uid is out of slots
create or replace function public.check_recipe_quota(uid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  q json := public.recipe_quota_for(uid);
begin
  if (q ->> 'limit') is not null and (q ->> 'used')::int >= (q ->> 'limit')::int then
    raise exception 'rate limit: % recipes a day%', q ->> 'limit',
      coalesce('; next one at ' || to_char((q ->> 'next_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '');
  end if;
end $$;
revoke all on function public.check_recipe_quota(uuid) from public, anon, authenticated;

create or replace function public.recipes_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
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
  perform public.check_recipe_quota(auth.uid());
  return new;
end $$;

-- ------------------------------------------------------------------ 3/4/5. new recipe columns
create or replace function public.valid_dose_curve(c jsonb) returns boolean
language plpgsql immutable as $$
declare
  pt jsonb;
begin
  if c is null then return true; end if;
  if jsonb_typeof(c) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(c) x where x not in ('metric', 'points')) then return false; end if;
  if jsonb_typeof(c -> 'metric') <> 'string' or length(btrim(c ->> 'metric')) not between 1 and 80 then return false; end if;
  if jsonb_typeof(c -> 'points') <> 'array' or jsonb_array_length(c -> 'points') not between 2 and 24 then return false; end if;
  for pt in select * from jsonb_array_elements(c -> 'points') loop
    if jsonb_typeof(pt) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(pt) x where x not in ('dose', 'value')) then return false; end if;
    if jsonb_typeof(pt -> 'dose') <> 'number' or jsonb_typeof(pt -> 'value') <> 'number' then return false; end if;
    if abs((pt ->> 'dose')::numeric) > 100 then return false; end if;
  end loop;
  return true;
end $$;

alter table public.recipes add column if not exists dose_curve jsonb;
alter table public.recipes drop constraint if exists recipes_dose_curve_ok;
alter table public.recipes add constraint recipes_dose_curve_ok check (public.valid_dose_curve(dose_curve));
alter table public.recipes add column if not exists featured boolean not null default false;
alter table public.recipes add column if not exists draft boolean not null default false;

-- featured is admin-only; publishing a draft dates it now (so it shows up under "new")
create or replace function public.recipes_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.featured := false; end if;
  else
    if not public.is_admin() then new.featured := old.featured; end if;
    if old.draft and not new.draft then
      new.created_at := now(); new.date := current_date;
    end if;
    if new.draft and not old.draft then raise exception 'a published recipe can''t go back to draft'; end if;
  end if;
  return new;
end $$;
drop trigger if exists recipes_zz_flags on public.recipes;
create trigger recipes_zz_flags before insert or update on public.recipes for each row execute function public.recipes_flags();

-- drafts are visible only to their owner (and admins)
drop policy if exists "read visible recipes" on public.recipes;
create policy "read visible recipes" on public.recipes for select
  using ((not hidden and not draft) or user_id = auth.uid() or public.is_admin());

-- moderation runs when a recipe goes public: on insert unless it's a draft, or when a draft is published
create or replace function public.recipes_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origin = 'site' and not new.draft then perform public.request_moderation('recipe', new.id); end if;
  return new;
end $$;
create or replace function public.recipes_after_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origin = 'site' and old.draft and not new.draft then perform public.request_moderation('recipe', new.id); end if;
  return new;
end $$;
drop trigger if exists recipes_moderate_publish on public.recipes;
create trigger recipes_moderate_publish after update on public.recipes for each row execute function public.recipes_after_publish();

-- ------------------------------------------------------------------ 2. tag aliases
create table if not exists public.tag_aliases (
  alias text primary key check (alias ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(alias) <= 32),
  tag   text not null check (tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(tag) <= 32),
  check (alias <> tag)
);
alter table public.tag_aliases enable row level security;
drop policy if exists "aliases are public" on public.tag_aliases;
create policy "aliases are public" on public.tag_aliases for select using (true);

-- maps aliases to their tag and drops duplicates, keeping order
create or replace function public.canon_tags(t text[]) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(x order by i), '{}') from (
    select distinct on (x) x, i from (
      select coalesce(a.tag, u.x) as x, u.i
      from unnest(t) with ordinality as u(x, i) left join public.tag_aliases a on a.alias = u.x
    ) m order by x, i
  ) d
$$;

create or replace function public.recipes_canon_tags() returns trigger
language plpgsql set search_path = public as $$
begin
  new.tags := public.canon_tags(new.tags);
  return new;
end $$;
drop trigger if exists recipes_aab_tags on public.recipes;
create trigger recipes_aab_tags before insert or update of tags on public.recipes for each row execute function public.recipes_canon_tags();

-- admin: fold tag src into dst everywhere, and remember it so future posts map src -> dst
create or replace function public.merge_tag(src text, dst text) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  src := lower(btrim(src)); dst := lower(btrim(dst));
  if src = dst then raise exception 'same tag'; end if;
  update public.tag_aliases set tag = dst where tag = src;
  delete from public.tag_aliases where alias = dst;
  insert into public.tag_aliases (alias, tag) values (src, dst) on conflict (alias) do update set tag = excluded.tag;
  update public.recipes set tags = public.canon_tags(tags) where src = any (tags);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.merge_tag(text, text) from public, anon;
grant execute on function public.merge_tag(text, text) to authenticated;

-- ------------------------------------------------------------------ 1. reproductions
create table if not exists public.reproductions (
  id            bigint generated always as identity primary key,
  recipe_id     text not null references public.recipes(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  author_handle text not null,
  prompt        text check (prompt is null or length(prompt) <= 4000),
  output        text not null check (length(btrim(output)) between 1 and 8000),
  note          text check (note is null or length(note) <= 1000),
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (recipe_id, user_id)
);
create index if not exists reproductions_recipe on public.reproductions (recipe_id);

create or replace function public.reproductions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if public.is_backend() then return new; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
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
drop trigger if exists reproductions_bi on public.reproductions;
create trigger reproductions_bi before insert on public.reproductions for each row execute function public.reproductions_before_insert();

create or replace function public.reproductions_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.request_moderation('reproduction', new.id::text);
  return new;
end $$;
drop trigger if exists reproductions_moderate on public.reproductions;
create trigger reproductions_moderate after insert on public.reproductions for each row execute function public.reproductions_after_insert();

alter table public.reproductions enable row level security;
drop policy if exists "read visible reproductions" on public.reproductions;
create policy "read visible reproductions" on public.reproductions for select using (not hidden or user_id = auth.uid() or public.is_admin());
drop policy if exists "reproduce" on public.reproductions;
create policy "reproduce" on public.reproductions for insert to authenticated with check (true);
drop policy if exists "hide reproductions (admin)" on public.reproductions;
create policy "hide reproductions (admin)" on public.reproductions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "delete own or admin" on public.reproductions;
create policy "delete own or admin" on public.reproductions for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- reports can point at a reproduction too
alter table public.reports add column if not exists reproduction_id bigint references public.reproductions(id) on delete cascade;

-- stats: add the reproduction count
create or replace view public.recipe_stats with (security_invoker = false) as
select r.id as recipe_id,
       coalesce(v.score, 0)::int as score,
       coalesce(v.ups, 0)::int as ups,
       coalesce(v.downs, 0)::int as downs,
       coalesce(c.n, 0)::int as comments,
       coalesce(p.n, 0)::int as reproductions
from public.recipes r
left join (select recipe_id, sum(value) as score, count(*) filter (where value > 0) as ups,
                  count(*) filter (where value < 0) as downs
           from public.votes group by recipe_id) v on v.recipe_id = r.id
left join (select recipe_id, count(*) as n from public.comments where not hidden group by recipe_id) c on c.recipe_id = r.id
left join (select recipe_id, count(*) as n from public.reproductions where not hidden group by recipe_id) p on p.recipe_id = r.id;

-- treetowntree: first trusted publisher
update public.profiles set trusted = true where handle = 'treetowntree';

-- the moderation log records reproductions too
alter table public.moderation_log drop constraint if exists moderation_log_kind_check;
alter table public.moderation_log add constraint moderation_log_kind_check check (kind in ('comment', 'recipe', 'reproduction'));
