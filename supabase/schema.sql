-- neuronary on Supabase: user submissions, votes, comments. Paste into the SQL editor of a new project, once.
-- Recipes added to the git repo (recipes/*.json) don't live here; votes and comments refer to recipes by id,
-- so repo recipes and submitted ones are voted on the same way.

create table if not exists public.recipes (
  id            text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 64),
  name          text not null check (length(name) between 1 and 80),
  description   text not null check (length(description) between 1 and 600),
  model         text not null check (model ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  neurons       jsonb not null check (jsonb_typeof(neurons) = 'array' and jsonb_array_length(neurons) between 1 and 64),
  method        jsonb,
  sampling      jsonb,
  conditional   jsonb,
  tags          text[] not null check (cardinality(tags) between 1 and 12),
  examples      jsonb not null check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) between 1 and 12),
  aliases       text[] not null default '{}',
  source        text,
  notes         text check (length(notes) <= 4000),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_handle text not null,
  author_url    text,
  created_at    timestamptz not null default now()
);

create table if not exists public.votes (
  recipe_id  text not null,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create table if not exists public.comments (
  id            bigint generated always as identity primary key,
  recipe_id     text not null,
  parent_id     bigint references public.comments (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_handle text not null,
  body          text not null check (length(body) between 1 and 4000),
  created_at    timestamptz not null default now()
);
create index if not exists comments_recipe on public.comments (recipe_id, created_at);

create or replace view public.recipe_stats with (security_invoker = true) as
select recipe_id, coalesce(sum(score), 0)::int as score, coalesce(sum(comments), 0)::int as comments
from (
  select recipe_id, value as score, 0 as comments from public.votes
  union all
  select recipe_id, 0, 1 from public.comments
) t
group by recipe_id;

alter table public.recipes  enable row level security;
alter table public.votes    enable row level security;
alter table public.comments enable row level security;

-- everyone reads everything
create policy "read recipes"  on public.recipes  for select using (true);
create policy "read votes"    on public.votes    for select using (true);
create policy "read comments" on public.comments for select using (true);

-- signed-in users write their own rows
create policy "submit recipe" on public.recipes  for insert to authenticated with check (user_id = auth.uid());
create policy "edit recipe"   on public.recipes  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete recipe" on public.recipes  for delete to authenticated using (user_id = auth.uid());
create policy "cast vote"     on public.votes    for insert to authenticated with check (user_id = auth.uid());
create policy "change vote"   on public.votes    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "retract vote"  on public.votes    for delete to authenticated using (user_id = auth.uid());
create policy "comment"       on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "delete comment" on public.comments for delete to authenticated using (user_id = auth.uid());

-- moderation: rows can be removed from the dashboard (table editor) with the service role, which bypasses RLS.
