-- JDC Platform — Migration 056: website lead intake
-- The jdcremodeling.com quote form now posts straight into BuildOS
-- (/api/public/leads) instead of BuilderTrend. Those leads have no BuildOS
-- user behind them, so created_by can no longer be required.

ALTER TABLE public.leads ALTER COLUMN created_by DROP NOT NULL;

-- Duplicate-submit check in the intake route looks up recent leads by email.
CREATE INDEX IF NOT EXISTS leads_client_email_created_idx
  ON public.leads (lower(client_email), created_at DESC);
