-- Migration 025: Hermes Discord integration + SMS ingestion

-- ─────────────────────────────────────────────────────────────────
-- DISCORD USERS
-- Maps a Discord user ID to a JDC Platform user ID.
-- Created when a user links their Discord account in app settings.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discord_users (
  discord_user_id TEXT        PRIMARY KEY,
  jdc_user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discord_users_select_own" ON public.discord_users
  FOR SELECT USING (jdc_user_id = auth.uid());

CREATE POLICY "discord_users_insert_own" ON public.discord_users
  FOR INSERT WITH CHECK (jdc_user_id = auth.uid());

CREATE POLICY "discord_users_delete_own" ON public.discord_users
  FOR DELETE USING (jdc_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_discord_users_jdc_user_id ON public.discord_users(jdc_user_id);

-- ─────────────────────────────────────────────────────────────────
-- USER SMS MESSAGES
-- SMS messages pushed by Tasker when the user opens the app.
-- msg_hash prevents duplicate inserts (hash of user_id+sender+received_at).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_sms_messages (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender      TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  msg_hash    TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_select_own" ON public.user_sms_messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sms_insert_own" ON public.user_sms_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_sms_user_id       ON public.user_sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_received_at   ON public.user_sms_messages(received_at DESC);
