-- Unit cost is always labor + material + sub
-- ==========================================
-- The rule was already the intent (see lib/estimates/costBreakdown.ts) but only ever
-- enforced in application code, and a truncated sibling lookup in the Fixer line builder
-- wrote 30 of the Schroeder estimate's 39 lines with a bare unit cost and three empty
-- buckets. This migration backfills what was lost, gives the cost book the same three
-- buckets a line has, and makes the invariant something the database enforces rather
-- than something every new write path has to remember.

-- 1. The cost book prices in the same three buckets as an estimate line, so a corrected
--    price can carry a sub cost instead of being forced into labor or material.
alter table cost_catalog
  add column if not exists sub_cost numeric not null default 0;

-- 2. JDC prices at 50% unless an estimator changes it by hand.
alter table estimate_lines
  alter column markup_pct set default 50;

-- 3. Any line traceable to a workbook line takes that line's real split. The importer
--    kept each cost type as its own row sharing a row_number, so one workbook line is up
--    to three rows here. Guarded on the total matching what is already stored: this fills
--    in the breakdown, it does not reprice anything.
with grouped as (
  select el.id as line_id,
         sum(s.unit_cost) filter (where s.cost_type = 'materials')   as material_cost,
         sum(s.unit_cost) filter (where s.cost_type = 'subcontract') as sub_cost,
         sum(s.unit_cost) filter (where s.cost_type is distinct from 'materials'
                                   and s.cost_type is distinct from 'subcontract') as labor_cost,
         sum(s.unit_cost) as total
  from estimate_lines el
  join historical_estimate_lines h on h.id = el.source_line_id
  join historical_estimate_lines s
    on  s.historical_estimate_id = h.historical_estimate_id
    and s.row_number = h.row_number
  where el.labor_cost is null
    and el.material_cost is null
    and el.sub_cost is null
  group by el.id
)
update estimate_lines el
set labor_cost    = round(g.labor_cost, 4),
    material_cost = round(g.material_cost, 4),
    sub_cost      = round(g.sub_cost, 4),
    unit_cost     = round(g.total, 4)
from grouped g
where el.id = g.line_id
  and round(g.total, 4) = round(el.unit_cost, 4);

-- 4. Whatever is left has no split to recover — hand-typed, or priced at market with no
--    comp behind it. The whole unit cost becomes material: the one bucket that asserts
--    nothing further about the work. No price moves.
update estimate_lines
set material_cost = round(unit_cost, 4)
where labor_cost is null
  and material_cost is null
  and sub_cost is null;

-- 5. Fixer used to copy each comp's markup across, which is how a batch of lines ended up
--    at 50.02%, 50.13%, 50.47%. Snap that noise back to a flat 50. Deliberate markups on
--    hand-built lines (15/20/25 on the older estimates) are left alone.
update estimate_lines
set markup_pct = 50
where source in ('ai_comp', 'ai_market')
  and markup_pct > 50
  and markup_pct < 51;

-- 6. The invariant, enforced. A bucket set but not summed into unit_cost is now an insert
--    error rather than a silently wrong number on a proposal.
alter table estimate_lines
  drop constraint if exists estimate_lines_unit_cost_is_split;
alter table estimate_lines
  add constraint estimate_lines_unit_cost_is_split check (
    round(unit_cost, 4) = round(
      coalesce(labor_cost, 0) + coalesce(material_cost, 0) + coalesce(sub_cost, 0), 4
    )
  );
