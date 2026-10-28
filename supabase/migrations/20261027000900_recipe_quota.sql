-- How many recipes the signed-in user can still publish today, for the submit page ("12 of 20 left today").
-- limit is null for admins (no limit). next_at: when the next slot opens if none are left.
create or replace function public.my_recipe_quota() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  lim int;
  used int;
  next_at timestamptz;
begin
  if auth.uid() is null then return null; end if;
  if public.is_admin() then return json_build_object('limit', null, 'used', 0, 'next_at', null); end if;
  lim := coalesce((select recipe_limit from public.profiles where id = auth.uid()), 20);
  select count(*) into used from public.recipes where user_id = auth.uid() and created_at > now() - interval '1 day';
  if used >= lim then
    select created_at + interval '1 day' into next_at from public.recipes
      where user_id = auth.uid() and created_at > now() - interval '1 day'
      order by created_at desc offset greatest(lim - 1, 0) limit 1;
  end if;
  return json_build_object('limit', lim, 'used', used, 'next_at', next_at);
end $$;

revoke all on function public.my_recipe_quota() from public, anon;
grant execute on function public.my_recipe_quota() to authenticated;
