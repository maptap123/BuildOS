ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_jobs_tags ON public.jobs USING GIN (tags);
