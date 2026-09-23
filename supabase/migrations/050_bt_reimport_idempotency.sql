-- 050_bt_reimport_idempotency.sql
--
-- Makes a full BuilderTrend re-import safe to run repeatedly.
--
-- Context: BuildOS goes live and JDC comes off BuilderTrend. Every BT-sourced
-- table already carries its BT source id, but three of them have no unique
-- constraint on it, so the importers cannot UPSERT and a second run duplicates
-- rows. schedule_items is the worst case: bt-seed.ts plain-INSERTs, so re-running
-- it doubles all 4,110 calendar rows.
--
-- Verified against the live DB before writing this file (2026-09-23):
--   contacts.bt_contact_id   740 rows / 740 distinct  -> 0 duplicates
--   daily_logs.bt_log_id    3172 rows / 3156 distinct -> 0 duplicates (16 NULL)
--   schedule_items          4110 rows, all distinct on (job_id,title,start,end)
-- so every index below can be created without cleaning data first.

-- ─── 1. schedule_items: no BT id column at all ────────────────────────────────
-- BT calendar records carry `id` (e.g. 119109644); bt-seed.ts dropped it on the
-- floor. Add it so the calendar import can upsert. Backfill for the existing
-- 4,110 rows is done by scripts/bt-backfill-schedule-ids.ts, which re-reads
-- bt-export/by-job/*/calendar.json and matches on (job,title,start,end).
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS bt_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS schedule_items_bt_event_id_key
  ON public.schedule_items (bt_event_id);

COMMENT ON COLUMN public.schedule_items.bt_event_id IS
  'BuilderTrend calendar item id. Conflict target for the schedule re-import.';

-- ─── 2. contacts.bt_contact_id: column exists, no constraint ──────────────────
-- bt-seed-missing.ts currently dedupes in JS by pre-loading every existing id,
-- which is racy and silently capped by PostgREST max-rows. Make the DB enforce it.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_bt_contact_id_key
  ON public.contacts (bt_contact_id);

-- ─── 3. daily_logs.bt_log_id: partial unique index is not an ON CONFLICT target ┐
-- 007 created `... WHERE bt_log_id IS NOT NULL`. Postgres will not accept a
-- partial index as a conflict target unless the statement repeats the predicate,
-- which PostgREST/supabase-js cannot express -- so the upsert fails with 42P10.
-- A plain unique index behaves identically here: Postgres treats NULLs as
-- distinct, so the 16 legacy rows with a NULL bt_log_id are unaffected.
DROP INDEX IF EXISTS idx_daily_logs_bt_log_id;

CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_bt_log_id_key
  ON public.daily_logs (bt_log_id);

-- ─── 4. Already unique on the live DB -- asserted here so the repo matches ─────
-- jobs.job_number          UNIQUE (001)
-- log_photos.bt_photo_id   unique live, never captured in a migration
-- time_entries.bt_shift_id unique live, never captured in a migration
-- Recreating them is a no-op if they exist under another name; IF NOT EXISTS
-- guards on the index name, so these are safe either way.
CREATE UNIQUE INDEX IF NOT EXISTS log_photos_bt_photo_id_key
  ON public.log_photos (bt_photo_id);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_bt_shift_id_key
  ON public.time_entries (bt_shift_id);
