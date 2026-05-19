-- Add warranty status and closeout fields to jobs
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('lead','presale','active','warranty','closed','archived'));

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_start_date DATE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_end_date DATE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS closeout_checklist JSONB NOT NULL DEFAULT '{}';
-- checklist keys: punch_list_complete, final_invoice_sent, client_walkthrough, lien_waivers, warranty_docs, closeout_photos
