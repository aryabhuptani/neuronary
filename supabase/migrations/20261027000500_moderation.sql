-- jev moderation: after a new comment or site recipe, the database asks the `moderate` edge function to review it
-- (async via pg_net, so posting never waits on the model). The function hides removals and logs every decision here.
create extension if not exists pg_net;

create table if not exists public.moderation_log (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('comment', 'recipe')),
  target_id  text not null,
  verdict    text not null check (verdict in ('allow', 'remove')),
  reason     text,
  model      text,
  error      text,
  created_at timestamptz not null default now()
);
alter table public.moderation_log enable row level security;
create policy "admins read moderation log" on public.moderation_log for select to authenticated using (public.is_admin());

-- the shared secret the edge function checks lives in Vault, readable only by the database owner
create or replace function public.request_moderation(kind text, target text) returns void
language plpgsql security definer set search_path = public as $$
declare
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'moderation_secret');
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
begin
  if secret is null or base is null then return; end if;
  perform net.http_post(
    url := base || '/functions/v1/moderate',
    body := jsonb_build_object('kind', kind, 'id', target),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-moderation-secret', secret),
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.request_moderation(text, text) from public, anon, authenticated;

create or replace function public.comments_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.request_moderation('comment', new.id::text);
  return new;
end $$;

create or replace function public.recipes_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origin = 'site' then perform public.request_moderation('recipe', new.id); end if;
  return new;
end $$;

drop trigger if exists comments_moderate on public.comments;
create trigger comments_moderate after insert on public.comments for each row execute function public.comments_after_insert();
drop trigger if exists recipes_moderate on public.recipes;
create trigger recipes_moderate after insert on public.recipes for each row execute function public.recipes_after_insert();
