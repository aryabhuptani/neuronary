-- Moderation (jev) is the per-post cost, and comments and throwaway accounts are where an abuser would spend it. No
-- sane user comments in bulk: 60 an hour / 300 a day per account. Picked-name sign-ups: 10 an hour per IP (auth
-- config); anyone who needs bulk accounts can ask. Recipes and reproductions stay generous: that's what people do.
create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_hour int;
  n_day int;
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
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) into n_hour, n_day
    from public.comments where user_id = auth.uid() and created_at > now() - interval '1 day';
  if n_hour >= 60 then raise exception 'rate limit: 60 comments an hour'; end if;
  if n_day >= 300 then raise exception 'rate limit: 300 comments a day'; end if;
  return new;
end $$;
