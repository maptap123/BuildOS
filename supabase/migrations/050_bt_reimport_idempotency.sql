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

-- ─── 3b. contacts.job_id must not CASCADE ─────────────────────────────────────
-- 004 declared `job_id UUID REFERENCES jobs(id) ON DELETE CASCADE`. That was
-- harmless while job_id was NULL on all 740 rows, but bt-link-job-contacts.ts
-- now populates it, so deleting a job would silently delete the client's entry
-- from the company address book -- and because the rule is CASCADE rather than
-- RESTRICT, the delete would not even be blocked by the 23503 guard in
-- src/app/api/jobs/[id]/route.ts. A contact is a person who happens to be
-- attached to a job; the person should outlive the job.
-- Drop whatever the FK is actually called rather than assuming the default
-- name -- if the name differed, a blind DROP IF EXISTS would no-op and we would
-- end up with two FKs on the column, the CASCADE one still winning.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public'
       AND rel.relname = 'contacts'
       AND con.contype = 'f'
       AND con.conkey = ARRAY[(
             SELECT attnum FROM pg_attribute
              WHERE attrelid = rel.oid AND attname = 'job_id'
           )]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.contacts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

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
