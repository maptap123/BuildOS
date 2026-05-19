-- JDC Platform — Migration 016: Add lead_id to jobs
-- Links a job back to the lead it was converted from.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON public.jobs(lead_id);
