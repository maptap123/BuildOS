-- JDC Platform — Migration 004: Logs, Contacts, Log Photos
-- • daily_logs: allow multiple per day, add timestamp + author name, make notes nullable
-- • contacts: new table for clients linked to jobs
-- • log_photos: new table for photos attached to daily log entries

-- ─────────────────────────────────────────────
-- DAILY LOGS: relax unique constraint + add fields
-- ─────────────────────────────────────────────

-- Drop the one-per-day-per-job constraint
ALTER TABLE public.daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_job_id_log_date_key;

-- Exact timestamp so multiple logs on the same day are distinguishable
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ;

-- Back-fill from log_date for any existing rows
UPDATE public.daily_logs
  SET logged_at = log_date::TIMESTAMPTZ
  WHERE logged_at IS NULL;

-- Author display name from BT (separate from created_by UUID which is the platform user)
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Some logs are photo-only with no text
ALTER TABLE public.daily_logs
  ALTER COLUMN work_performed DROP NOT NULL;

-- ─────────────────────────────────────────────
-- CONTACTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id       UUID        REFERENCES public.jobs(id) ON DELETE CASCADE,
  full_name    TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  postal_code  TEXT,
  is_primary   BOOLEAN     NOT NULL DEFAULT false,
  notes        TEXT,
  bt_contact_id TEXT,
  created_by   UUID        NOT NULL REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON public.contacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_view = true)
);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_create = true)
);
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_edit = true)
);
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_delete = true)
);

-- ─────────────────────────────────────────────
-- LOG PHOTOS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.log_photos (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  log_id       UUID        NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  job_id       UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  bt_photo_id  TEXT,
  file_name    TEXT,
  bt_url       TEXT,
  storage_path TEXT,
  caption      TEXT,
  taken_at     TIMESTAMPTZ,
  uploaded_by  UUID        REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.log_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "log_photos_select" ON public.log_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_view = true)
);
CREATE POLICY "log_photos_insert" ON public.log_photos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_create = true)
);
CREATE POLICY "log_photos_delete" ON public.log_photos FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_delete = true)
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_logs_job_date   ON public.daily_logs(job_id, log_date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_logged_at  ON public.daily_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_job_id       ON public.contacts(job_id);
CREATE INDEX IF NOT EXISTS idx_log_photos_log_id     ON public.log_photos(log_id);
CREATE INDEX IF NOT EXISTS idx_log_photos_job_id     ON public.log_photos(job_id);
