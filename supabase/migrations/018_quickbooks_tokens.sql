-- JDC Platform — Migration 016: QuickBooks Token Storage
-- Phase 4: Real Integrations
-- Run: supabase db push

-- ─────────────────────────────────────────────────────────────────
-- QUICKBOOKS TOKENS
-- Stores encrypted OAuth 2.0 tokens per organisation (realm).
-- access_token and refresh_token are stored as ciphertext —
-- encrypt with AES-256-GCM using QB_TOKEN_ENCRYPTION_KEY before
-- inserting, and decrypt in application code before API calls.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quickbooks_tokens (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id        TEXT        NOT NULL,               -- Intuit realm / company ID
  access_token  TEXT        NOT NULL,               -- AES-256-GCM encrypted ciphertext
  refresh_token TEXT        NOT NULL,               -- AES-256-GCM encrypted ciphertext
  realm_id      TEXT        NOT NULL,               -- Intuit realmId (same as org_id, kept for clarity)
  expires_at    TIMESTAMPTZ NOT NULL,               -- when the access_token expires (typically 1 hour)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER quickbooks_tokens_updated_at
  BEFORE UPDATE ON public.quickbooks_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Only one token record per Intuit realm
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_tokens_org_id ON public.quickbooks_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_tokens_realm_id       ON public.quickbooks_tokens(realm_id);

-- RLS: only admin users (can_manage on 'admin' module) may read/write tokens.
-- Service-role key bypasses RLS for server-side token refresh.
ALTER TABLE public.quickbooks_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qb_tokens_select" ON public.quickbooks_tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'admin'
        AND can_manage = true
    )
  );

CREATE POLICY "qb_tokens_insert" ON public.quickbooks_tokens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'admin'
        AND can_manage = true
    )
  );

CREATE POLICY "qb_tokens_update" ON public.quickbooks_tokens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'admin'
        AND can_manage = true
    )
  );

CREATE POLICY "qb_tokens_delete" ON public.quickbooks_tokens
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'admin'
        AND can_manage = true
    )
  );
