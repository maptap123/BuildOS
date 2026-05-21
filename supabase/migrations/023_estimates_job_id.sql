-- JDC Platform — Migration 023: Add job_id to estimates
-- Allows direct lookup of estimates from a job (in addition to via lead_id).

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_job_id ON public.estimates(job_id);
