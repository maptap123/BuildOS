-- JDC Platform — Migration 017: Hermes AI Agent Platform
-- Phase 10: Hermes — Agentic AI Platform (10a foundation)
-- Run: supabase db push

-- ─────────────────────────────────────────────────────────────────
-- HERMES CONVERSATIONS
-- Stores the full message thread per user. One row per conversation
-- session (created fresh or continued from an existing session).
--
-- messages JSONB schema (append-only array):
--   [
--     { "role": "user",      "content": "...", "timestamp": "ISO8601" },
--     { "role": "assistant", "content": "...", "timestamp": "ISO8601",
--       "tools_called": ["get_my_tasks"] }         -- Phase 10a: audit trail
--   ]
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hermes_conversations (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel    TEXT        NOT NULL DEFAULT 'app'
             CHECK (channel IN ('sms', 'app')),
  messages   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER hermes_conversations_updated_at
  BEFORE UPDATE ON public.hermes_conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.hermes_conversations ENABLE ROW LEVEL SECURITY;

-- Users may only read their own conversations; admins see all (via service role).
CREATE POLICY "hermes_conv_select" ON public.hermes_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "hermes_conv_insert" ON public.hermes_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "hermes_conv_update" ON public.hermes_conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_hermes_conv_user_id   ON public.hermes_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_hermes_conv_channel   ON public.hermes_conversations(channel);
CREATE INDEX IF NOT EXISTS idx_hermes_conv_updated_at ON public.hermes_conversations(updated_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- HERMES USER CONTEXT
-- Long-term memory per user. Hermes reads this at conversation start
-- and updates it at conversation end (Phase 10d: persistent memory).
--
-- preferences JSONB schema (example):
--   {
--     "preferred_job_names": { "church job": "<uuid>" },
--     "notify_channel": "sms",
--     "morning_brief": true
--   }
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hermes_user_context (
  user_id        UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_job_id    UUID        REFERENCES public.jobs(id) ON DELETE SET NULL,
  preferences    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  memory_summary TEXT,       -- Claude-written prose summary of past interactions
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.hermes_user_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hermes_ctx_select" ON public.hermes_user_context
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "hermes_ctx_upsert" ON public.hermes_user_context
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_hermes_ctx_last_job_id ON public.hermes_user_context(last_job_id);
