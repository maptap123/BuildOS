-- JDC Platform — Migration 057: lead attachments + typed lead activity
-- The lead detail page was read-only in practice (no delete, no files, no way
-- to log a call). This adds what the revamped page needs.

-- ─────────────────────────────────────────────
-- ATTACHMENTS — files live in the private `lead-files` bucket under
-- <lead_id>/<timestamp>-<name>; all access goes through the API with the
-- service role, so RLS is on with no policies.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_attachments (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  file_name    TEXT        NOT NULL,
  storage_path TEXT        NOT NULL UNIQUE,
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_attachments_lead_idx ON public.lead_attachments (lead_id, created_at DESC);
ALTER TABLE public.lead_attachments ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-files', 'lead-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- ACTIVITY KINDS — a note, a logged call/text/email/meeting, or an automatic
-- status-change entry.
-- ─────────────────────────────────────────────
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note'
  CHECK (kind IN ('note','call','text','email','meeting','status'));
