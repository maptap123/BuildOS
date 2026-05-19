-- JDC Platform - Migration 021: Public proposal approval metadata
-- Adds public-token client response fields to estimates for proposal acceptance links.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_signature TEXT,
  ADD COLUMN IF NOT EXISTS client_response_note TEXT;

UPDATE public.estimates
SET public_token = uuid_generate_v4()
WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_public_token
  ON public.estimates(public_token)
  WHERE public_token IS NOT NULL;
