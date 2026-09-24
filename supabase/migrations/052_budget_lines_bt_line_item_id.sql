-- 052: BuilderTrend source id on budget_lines, so bt-seed-estimates.ts can
-- upsert (re-run safely) like every other BT-sourced table.
-- Plain unique index, not partial: supabase-js cannot target a partial index
-- with ON CONFLICT (see 050), and NULLs stay distinct for native budget lines.

ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS bt_line_item_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_bt_line_item_id_key ON budget_lines (bt_line_item_id);

NOTIFY pgrst, 'reload schema';
