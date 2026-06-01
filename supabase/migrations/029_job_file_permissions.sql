-- BuildOS - Migration 029: Job File Permissions
-- Tracks per-file visibility settings for SharePoint/OneDrive files linked to a job.
-- Defaults to admin_only so new files are never accidentally exposed.

CREATE TABLE IF NOT EXISTS public.job_file_permissions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sharepoint_item_id   text        NOT NULL,
  visibility           text        NOT NULL DEFAULT 'admin_only'
                                    CHECK (visibility IN ('admin_only', 'all')),
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sharepoint_item_id)
);

CREATE INDEX IF NOT EXISTS idx_job_file_permissions_job_id
  ON public.job_file_permissions(job_id);

CREATE TRIGGER job_file_permissions_updated_at
  BEFORE UPDATE ON public.job_file_permissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
