-- JDC Platform - Migration 028: Job External Links
-- Adds job_external_links table for QuickBooks/SharePoint/OneDrive/Buildertrend cross-references.
-- Adds document-sync summary columns to jobs.
-- Safe phase: external systems remain read-only; this migration only stores BuildOS links.

CREATE TABLE IF NOT EXISTS public.job_external_links (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid         NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  provider           text         NOT NULL CHECK (provider IN ('quickbooks','sharepoint','onedrive','buildertrend')),
  external_id        text         NOT NULL,
  external_parent_id text,
  display_name       text,
  external_url       text,
  external_path      text,
  link_type          text         NOT NULL DEFAULT 'job'
                                   CHECK (link_type IN ('job','customer','folder','file','invoice','estimate','other')),
  status             text         NOT NULL DEFAULT 'linked'
                                   CHECK (status IN ('candidate','linked','rejected','stale','error')),
  confidence         numeric(5,4),
  match_reason       text,
  matched_by         text         NOT NULL DEFAULT 'system'
                                   CHECK (matched_by IN ('system','admin','migration')),
  raw_metadata       jsonb        NOT NULL DEFAULT '{}',
  last_verified_at   timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_external_links_job_provider_external
  ON public.job_external_links(job_id, provider, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_external_links_provider_external_id_linked
  ON public.job_external_links(provider, external_id)
  WHERE status = 'linked';

CREATE INDEX IF NOT EXISTS idx_job_external_links_job_id
  ON public.job_external_links(job_id);

CREATE INDEX IF NOT EXISTS idx_job_external_links_provider_status
  ON public.job_external_links(provider, status);

CREATE TRIGGER job_external_links_updated_at
  BEFORE UPDATE ON public.job_external_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS sharepoint_folder_url        text,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_path       text,
  ADD COLUMN IF NOT EXISTS sharepoint_drive_item_id     text,
  ADD COLUMN IF NOT EXISTS documents_sync_status        text NOT NULL DEFAULT 'not_linked'
                                                         CHECK (documents_sync_status IN ('not_linked','candidate','linked','error')),
  ADD COLUMN IF NOT EXISTS documents_last_checked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS documents_sync_error         text;
