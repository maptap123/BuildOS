-- The catalog's divisions, for the estimate builder's filter dropdown
-- ==================================================================
-- The dropdown used to be built client-side from the first page of catalog items, so it
-- only ever offered "01 Plans and Permits" and "02 Tear-Out and Demolition": the list is
-- ordered by division, and divisions 01 and 02 alone are 390 of the 2,284 active rows.
-- Fetching every row and de-duplicating in JS is not the fix — PostgREST caps a response
-- at 1000 rows, which would silently stop the list at division 09. The DISTINCT has to
-- happen in the database, so it happens here.

create or replace function public.cost_catalog_divisions()
returns table (division_num text, division_name text, item_count bigint)
language sql
stable
as $$
  select
    c.division_num,
    min(c.division_name) as division_name,
    count(*)             as item_count
  from public.cost_catalog c
  where c.is_active
    and c.division_num is not null
    and c.division_num <> ''
  group by c.division_num
  order by c.division_num;
$$;

comment on function public.cost_catalog_divisions() is
  'Distinct active cost_catalog divisions with item counts, for the estimate builder filter.';

grant execute on function public.cost_catalog_divisions() to authenticated, service_role;
