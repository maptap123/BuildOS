-- 053: make the BT budget-line key per job.
--
-- 052 made bt_line_item_id globally unique. That holds for worksheet line items,
-- but bt-seed-estimates.ts also loads BT's legacy job-costing budget by cost code,
-- and BT cost-code ids are company-wide: Tighe Garage and Ryan Porch share them,
-- so the second job's upsert moved 12 of the first job's rows onto itself.

DROP INDEX IF EXISTS budget_lines_bt_line_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_job_bt_line_item_key ON budget_lines (job_id, bt_line_item_id);

NOTIFY pgrst, 'reload schema';
