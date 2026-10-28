-- Daily recipe limit: 100 for everyone (trusted publishers 500, admins unlimited). The first night's only accounts to
-- hit 20 were the two best contributors; nobody spammed.
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
  lim := coalesce(p.recipe_limit, case when coalesce(p.trusted, false) then 500 else 100 end);
  select count(*) into used from public.publish_log where user_id = uid and created_at > now() - interval '1 day';
  if used >= lim then
    select created_at + interval '1 day' into next_at from public.publish_log
      where user_id = uid and created_at > now() - interval '1 day'
      order by created_at desc offset greatest(lim - 1, 0) limit 1;
  end if;
  return json_build_object('limit', lim, 'used', used, 'next_at', next_at);
end $$;
-- treetowntree had a hand-set 200 from launch day; trusted covers it now
update public.profiles set recipe_limit = null where handle = 'treetowntree' and recipe_limit = 200;
