-- Vote and comment totals for every recipe, hidden or not. Hidden recipes are already invisible to the public
-- through the recipes table's row-level security, and admins need the real numbers when reviewing them.
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
left join (select recipe_id, count(*) as n from public.comments where not hidden group by recipe_id) c on c.recipe_id = r.id;
