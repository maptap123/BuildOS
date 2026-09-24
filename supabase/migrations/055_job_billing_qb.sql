-- 055: client billing pulled from QuickBooks (read-only mirror; QB is the source of truth).
--
-- One row per QB Invoice / CreditMemo / SalesReceipt / RefundReceipt tagged to a
-- linked job, and one row per (Payment, job) — a payment is attributed to the
-- job of the invoices it pays. Written only by src/lib/quickbooks/billingSync.ts
-- (daily full pull + Intuit webhook). BuildOS-authored draw schedules stay in
-- billing_milestones; this table is never edited in BuildOS.

CREATE TABLE IF NOT EXISTS job_billing (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  qb_txn_type        TEXT NOT NULL CHECK (qb_txn_type IN ('Invoice', 'Payment', 'CreditMemo', 'SalesReceipt', 'RefundReceipt')),
  qb_txn_id          TEXT NOT NULL,
  qb_customer_id     TEXT,
  doc_number         TEXT,
  txn_date           DATE NOT NULL,
  due_date           DATE,
  amount             NUMERIC NOT NULL,  -- always positive; qb_txn_type says which way it moves the job
  balance            NUMERIC,           -- Invoice: open balance per QB. CreditMemo: unapplied credit. Payment: unapplied deposit.
  description        TEXT,
  linked_invoice_ids TEXT[],            -- Payment: the QB invoices it pays
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (qb_txn_type, qb_txn_id, job_id)
);

CREATE INDEX IF NOT EXISTS job_billing_job_id_idx ON job_billing (job_id, txn_date DESC);

ALTER TABLE job_billing ENABLE ROW LEVEL SECURITY;  -- read through the admin client behind budget-permission checks only

NOTIFY pgrst, 'reload schema';
