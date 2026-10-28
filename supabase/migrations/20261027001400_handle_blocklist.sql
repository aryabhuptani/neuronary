-- Picked names can't be slurs. Leetspeak is folded first.
create or replace function public.handle_is_blocked(h text) returns boolean
language sql immutable as $$
  with n as (select translate(lower(coalesce(h, '')), '013457@$', 'oieastas') as x)
  -- unambiguous: anywhere in the name (separators removed)
  select regexp_replace(x, '[_\-.]', '', 'g') ~ '(fag|nigg|kike|tranny|trannie|retard|hitler)'
      -- short ones that hide inside ordinary words (raccoon, therapist, skyscraper): only as a whole name or a whole
      -- part between underscores/digits
      or exists (select 1 from regexp_split_to_table(x, '[_\-.0-9]+') t
                 where t in ('spic', 'coon', 'kys', 'dyke', 'nazi', 'rapist', 'pedo', 'gook', 'beaner', 'wetback', 'chink', 'nazis', 'pedos', 'dykes'))
  from n
$$;

create or replace function public.claim_handle(h text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if h !~ '^[A-Za-z0-9_]{2,24}$' then raise exception 'bad handle: 2-24 letters, digits or _'; end if;
  if public.handle_is_blocked(h) then raise exception 'pick a different name'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'you already have a handle';
  end if;
  if exists (select 1 from public.profiles where handle = h) then raise exception 'handle taken'; end if;
  insert into public.profiles (id, handle) values (auth.uid(), h);
  return h;
end $$;
