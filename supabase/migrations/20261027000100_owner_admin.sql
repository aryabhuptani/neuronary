-- The site owner's X account is admin from its first sign-in. x_handle is only ever set from a verified X identity
-- (handle_new_user / handle_user_updated), never by users, so this can't be claimed with a picked name.
create or replace function public.profiles_owner_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.x_handle, '')) = '_lyraaaa_' then
    new.is_admin := true;
  end if;
  return new;
end $$;

create trigger profiles_owner_admin before insert or update of x_handle on public.profiles
  for each row execute function public.profiles_owner_admin();
