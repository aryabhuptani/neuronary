-- neuronary backend: profiles, recipes, votes, comments, reports.
-- The database is the source of truth. recipes/*.json in the git repo are synced in by scripts/sync_repo.py
-- (origin = 'repo', no owning user; admins can edit them on the site).

create extension if not exists citext;

-- ------------------------------------------------------------------ helpers

-- true for the service role (sync script) and direct database sessions (dashboard SQL editor), which bypass
-- ownership rules. session_user, not current_user: inside a security definer trigger current_user is the owner.
create or replace function public.is_backend() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')
$$;

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  handle     citext not null unique check (handle ~ '^[A-Za-z0-9_]{2,24}$'),
  x_handle   text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin)
$$;

create or replace function public.my_handle() returns text
language sql stable security definer set search_path = public as $$
  select handle::text from public.profiles where id = auth.uid()
$$;

-- first free handle starting from `base`: base, base2, base3, ...
create or replace function public.free_handle(base text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  b text := left(regexp_replace(coalesce(base, ''), '[^A-Za-z0-9_]', '', 'g'), 20);
  h text;
  k int := 1;
begin
  if length(b) < 2 then b := 'user'; end if;
  h := b;
  while exists (select 1 from public.profiles where handle = h) loop
    k := k + 1;
    h := b || k;
  end loop;
  return h;
end $$;

-- OAuth sign-ups (X etc.) get a profile from their provider username. Anonymous users pick one with claim_handle().
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := coalesce(m ->> 'user_name', m ->> 'preferred_username');
begin
  if coalesce(new.is_anonymous, false) or uname is null then
    return new;
  end if;
  insert into public.profiles (id, handle, x_handle)
  values (new.id, public.free_handle(uname), case when new.raw_app_meta_data ->> 'provider' in ('twitter', 'x') then uname end)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- an anonymous user linking X later: give them their X handle if they had no profile yet
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := coalesce(m ->> 'user_name', m ->> 'preferred_username');
begin
  if uname is not null then
    insert into public.profiles (id, handle, x_handle) values (new.id, public.free_handle(uname), uname)
    on conflict (id) do update set x_handle = excluded.x_handle where public.profiles.x_handle is null;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- pick a handle (once). Returns the handle, or raises 'handle taken' / 'bad handle'.
create or replace function public.claim_handle(h text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if h !~ '^[A-Za-z0-9_]{2,24}$' then raise exception 'bad handle: 2-24 letters, digits or _'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'you already have a handle';
  end if;
  if exists (select 1 from public.profiles where handle = h) then raise exception 'handle taken'; end if;
  insert into public.profiles (id, handle) values (auth.uid(), h);
  return h;
end $$;

alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);
-- no insert/update policies: profiles change only through the functions above (or the dashboard)

-- ------------------------------------------------------------------ recipe validation

create or replace function public.valid_neurons(ns jsonb) returns boolean
language plpgsql immutable as $$
declare
  n jsonb;
  keys text[] := '{}';
  k text;
begin
  if jsonb_typeof(ns) <> 'array' or jsonb_array_length(ns) not between 1 and 64 then return false; end if;
  for n in select * from jsonb_array_elements(ns) loop
    if jsonb_typeof(n) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(n) x where x not in ('layer', 'expert', 'neuron', 'dose')) then return false; end if;
    if jsonb_typeof(n -> 'layer') <> 'number' or jsonb_typeof(n -> 'neuron') <> 'number' or jsonb_typeof(n -> 'dose') <> 'number' then return false; end if;
    if (n ->> 'layer')::numeric <> floor((n ->> 'layer')::numeric) or (n ->> 'layer')::numeric < 0 then return false; end if;
    if (n ->> 'neuron')::numeric <> floor((n ->> 'neuron')::numeric) or (n ->> 'neuron')::numeric < 0 then return false; end if;
    if abs((n ->> 'dose')::numeric) > 100 then return false; end if;
    if n ? 'expert' and (jsonb_typeof(n -> 'expert') <> 'number' or (n ->> 'expert')::numeric < 0
        or (n ->> 'expert')::numeric <> floor((n ->> 'expert')::numeric)) then return false; end if;
    k := (n ->> 'layer') || ':' || coalesce(n ->> 'expert', '') || ':' || (n ->> 'neuron');
    if k = any (keys) then return false; end if;
    keys := keys || k;
  end loop;
  return true;
end $$;

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
    if length(btrim(e ->> 'prompt')) = 0 or length(btrim(e ->> 'output')) = 0 then return false; end if;
    if length(e ->> 'prompt') > 4000 or length(e ->> 'output') > 8000 or length(coalesce(e ->> 'base_output', '')) > 8000 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.valid_tags(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) between 1 and 12
     and not exists (select 1 from unnest(t) x where x !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(x) > 32)
     and cardinality(t) = (select count(distinct x) from unnest(t) x)
$$;

-- ------------------------------------------------------------------ recipes

create table public.recipes (
  id            text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 64),
  name          text not null check (length(btrim(name)) between 1 and 80),
  description   text not null check (length(btrim(description)) between 1 and 600),
  model         text not null check (model ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(model) <= 120),
  neurons       jsonb not null check (public.valid_neurons(neurons)),
  method        jsonb check (method is null or jsonb_typeof(method) = 'object'),
  sampling      jsonb check (sampling is null or jsonb_typeof(sampling) = 'object'),
  conditional   jsonb check (conditional is null or jsonb_typeof(conditional) = 'object'),
  tags          text[] not null check (public.valid_tags(tags)),
  examples      jsonb not null default '[]'::jsonb,
  aliases       text[] not null default '{}',
  source        text check (source is null or (source ~ '^https?://' and length(source) <= 500)),
  notes         text check (notes is null or length(notes) <= 4000),
  user_id       uuid references auth.users (id) on delete set null,
  author_handle text not null,
  author_url    text,
  origin        text not null default 'site' check (origin in ('site', 'repo')),
  repo_hash     text,
  date          date not null default current_date,
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint examples_ok check (public.valid_examples(examples, case when origin = 'site' then 1 else 0 end))
);
create index recipes_created on public.recipes (created_at desc);
create index recipes_tags on public.recipes using gin (tags);
create index recipes_user on public.recipes (user_id);

create or replace function public.recipes_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
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
  select count(*) into n from public.recipes where user_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'rate limit: 20 recipes a day'; end if;
  return new;
end $$;

create or replace function public.recipes_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then
    return new;
  end if;
  -- identity and provenance are fixed; only admins can hide
  new.id := old.id;
  new.user_id := old.user_id;
  new.author_handle := old.author_handle;
  new.author_url := old.author_url;
  new.origin := old.origin;
  new.repo_hash := old.repo_hash;
  new.created_at := old.created_at;
  new.date := old.date;
  if not public.is_admin() then new.hidden := old.hidden; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger recipes_bi before insert on public.recipes for each row execute function public.recipes_before_insert();
create trigger recipes_bu before update on public.recipes for each row execute function public.recipes_before_update();

alter table public.recipes enable row level security;
create policy "read visible recipes" on public.recipes for select using (not hidden or user_id = auth.uid() or public.is_admin());
create policy "publish" on public.recipes for insert to authenticated with check (true); -- trigger sets the owner
create policy "edit own or admin" on public.recipes for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (true); -- trigger pins ownership
create policy "delete own or admin" on public.recipes for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------ votes

create table public.votes (
  recipe_id  text not null references public.recipes (id) on delete cascade on update cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index votes_user on public.votes (user_id);

alter table public.votes enable row level security;
create policy "see own votes" on public.votes for select to authenticated using (user_id = auth.uid());
create policy "cast vote" on public.votes for insert to authenticated with check (user_id = auth.uid());
create policy "change vote" on public.votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "retract vote" on public.votes for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------ comments

create table public.comments (
  id            bigint generated always as identity primary key,
  recipe_id     text not null references public.recipes (id) on delete cascade on update cascade,
  parent_id     bigint references public.comments (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null default auth.uid(),
  author_handle text not null default '',
  body          text not null check (length(btrim(body)) between 1 and 4000),
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index comments_recipe on public.comments (recipe_id, created_at);

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
  if n >= 30 then raise exception 'rate limit: 30 comments an hour'; end if;
  return new;
end $$;

create trigger comments_bi before insert on public.comments for each row execute function public.comments_before_insert();

alter table public.comments enable row level security;
create policy "read visible comments" on public.comments for select using (not hidden or public.is_admin());
create policy "comment" on public.comments for insert to authenticated with check (true);
create policy "hide comments (admin)" on public.comments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "delete own or admin" on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------ reports

create table public.reports (
  id         bigint generated always as identity primary key,
  recipe_id  text references public.recipes (id) on delete cascade on update cascade,
  comment_id bigint references public.comments (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null default auth.uid(),
  reason     text not null check (length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (recipe_id is not null or comment_id is not null)
);

alter table public.reports enable row level security;
create policy "report" on public.reports for insert to authenticated with check (user_id = auth.uid());
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());
create policy "admins clear reports" on public.reports for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ stats

-- vote totals per recipe (individual votes stay private)
create or replace view public.recipe_stats with (security_invoker = false) as
select r.id as recipe_id,
       coalesce(v.score, 0)::int as score,
       coalesce(v.ups, 0)::int as ups,
       coalesce(v.downs, 0)::int as downs,
       coalesce(c.n, 0)::int as comments
from public.recipes r
left join (select recipe_id, sum(value) as score, count(*) filter (where value > 0) as ups,
                  count(*) filter (where value < 0) as downs
           from public.votes group by recipe_id) v on v.recipe_id = r.id
left join (select recipe_id, count(*) as n from public.comments where not hidden group by recipe_id) c on c.recipe_id = r.id
where not r.hidden;

grant select on public.recipe_stats to anon, authenticated;
revoke execute on function public.free_handle(text) from anon, authenticated;
