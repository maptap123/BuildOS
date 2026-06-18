-- 031_integration_settings_repair.sql
-- Repair migration: public.integration_settings was defined in 003_robust_features.sql
-- but never applied to the production database (the rest of 003's tables exist, this
-- block did not). Its absence caused GET /api/integrations/outlook to return HTTP 500
-- ("Could not find the table 'public.integration_settings' in the schema cache").
-- This recreates the table idempotently to bring drifted databases back in sync.

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  service        TEXT        NOT NULL UNIQUE
                   CHECK (service IN ('quickbooks','outlook','google_calendar')),
  is_connected   BOOLEAN     NOT NULL DEFAULT false,
  access_token   TEXT,
  refresh_token  TEXT,
  token_expiry   TIMESTAMPTZ,
  realm_id       TEXT,
  settings_json  JSONB       NOT NULL DEFAULT '{}',
  connected_by   UUID        REFERENCES public.users(id),
  connected_at   TIMESTAMPTZ,
  last_sync_at   TIMESTAMPTZ,
  sync_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS integration_settings_updated_at ON public.integration_settings;
CREATE TRIGGER integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations_admin_only" ON public.integration_settings;
CREATE POLICY "integrations_admin_only" ON public.integration_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
  );

INSERT INTO public.integration_settings (service, is_connected) VALUES
  ('quickbooks', false),
  ('outlook', false),
  ('google_calendar', false)
ON CONFLICT (service) DO NOTHING;
