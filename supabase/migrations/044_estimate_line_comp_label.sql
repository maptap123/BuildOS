-- BuildOS — Migration 044: name the comp on the line, not just the job link
--
-- 84 of the 188 imported historical estimates have no job_id (the links are cosmetic
-- and many were never matched), so comp_job_id is null for roughly half the comps.
-- A line badge keyed on it therefore mislabels a genuine comp line as coming from the
-- cost book. The estimate name is what the estimator actually recognises, so store it.
ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS comp_label TEXT;
