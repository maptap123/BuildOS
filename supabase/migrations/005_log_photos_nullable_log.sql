-- Migration 005: Make log_photos.log_id nullable
-- BT photos are job-level (not log-level), so we store them with job_id only.
-- Per-log association is preserved for photos uploaded directly via the platform.

ALTER TABLE public.log_photos
  ALTER COLUMN log_id DROP NOT NULL;

-- Index for job-level photo queries (already exists for log_id, add for coverage)
CREATE INDEX IF NOT EXISTS idx_log_photos_job_log ON public.log_photos(job_id, log_id);
