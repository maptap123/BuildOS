-- BuildOS — Migration 045: labor / material / sub on an estimate line
--
-- JDC's workbooks price a line in up to three buckets. The import preserved that as
-- separate rows sharing a row_number — 4,528 logical lines carry two cost types and
-- 208 carry all three — so the structure was in the data but nowhere in the builder,
-- which had a single unit_cost and no way to say what it was made of.
--
-- cost_catalog already agrees: unit_cost = labor_cost + material_cost holds for all
-- 5,388 rows. Same rule here, with subcontract added:
--
--     unit_cost = labor_cost + material_cost + sub_cost
--
-- unit_cost stays a real column rather than becoming generated. Manual and assembly
-- lines have always written it directly with no breakdown, and those must keep working;
-- it is recomputed on write whenever any bucket is set.

ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS labor_cost    NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS material_cost NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS sub_cost      NUMERIC(12,4);

ALTER TABLE public.estimate_line_proposals
  ADD COLUMN IF NOT EXISTS labor_cost    NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS material_cost NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS sub_cost      NUMERIC(12,4);

COMMENT ON COLUMN public.estimate_lines.labor_cost IS
  'Per-unit labor. Null means the line was priced as a single unit_cost with no breakdown.';
COMMENT ON COLUMN public.estimate_lines.sub_cost IS
  'Per-unit subcontract. 1,810 historical lines are subcontract-priced.';
