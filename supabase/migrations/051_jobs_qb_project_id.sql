-- 051: add jobs.qb_project_id, which migration 003 declared but the live DB never got.
--
-- The QB reconcile and auto-match routes write qb_customer_id and qb_project_id in
-- one update. With the column missing, PostgREST rejected the whole update (PGRST204),
-- so the 2026-05-27 reconcile saved its job_external_links rows but left every
-- jobs.qb_customer_id NULL.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qb_project_id TEXT;

NOTIFY pgrst, 'reload schema';
