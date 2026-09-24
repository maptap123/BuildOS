-- 054: QuickBooks-sourced job costs in actuals.
--
-- src/lib/quickbooks/costSync.ts pulls every Bill, Purchase (check / card / cash
-- expense) and VendorCredit line that QuickBooks tags to a linked job, one
-- actuals row per transaction line. (qb_txn_type, qb_txn_id, qb_line_id) is the
-- upsert key; rows with qb_txn_id NULL are entered in BuildOS and never touched
-- by the sync.

ALTER TABLE actuals
  ADD COLUMN IF NOT EXISTS qb_txn_type    TEXT,   -- 'Bill' | 'Purchase' | 'VendorCredit'
  ADD COLUMN IF NOT EXISTS qb_txn_id      TEXT,
  ADD COLUMN IF NOT EXISTS qb_line_id     TEXT,
  ADD COLUMN IF NOT EXISTS qb_customer_id TEXT,   -- the QB customer/sub-customer the line is tagged to
  ADD COLUMN IF NOT EXISTS qb_item_name   TEXT,   -- QB item (cost code, e.g. "23 Flr Cover SI") or expense account
  ADD COLUMN IF NOT EXISTS cost_class     TEXT;   -- QB class: Labor / Material / Subcontractor ...

CREATE UNIQUE INDEX IF NOT EXISTS actuals_qb_txn_line_key ON actuals (qb_txn_type, qb_txn_id, qb_line_id);

NOTIFY pgrst, 'reload schema';
