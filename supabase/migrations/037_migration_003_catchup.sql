-- JDC Platform - Migration 037: Catch up missing pieces of migration 003
-- Found during Week 2 Day 10 smoke testing (2026-08-19): migration 003_robust_features.sql
-- was never applied to the live database (absent from Supabase's migration history), but
-- some of the tables it also creates (change_orders, integration_settings) already exist —
-- created by some other, undocumented process. This migration applies only the genuinely
-- missing pieces of 003, skipping the parts that already exist (to avoid "already exists"
-- errors on the change_orders/integration_settings triggers and policies).
--
-- Practical impact before this fix:
--   - schedule_items missing percent_complete/trade/color/outlook_* — every "create schedule
--     item" call (POST /api/schedule, and the accepted-proposal → job starter schedule in
--     src/lib/proposals/conversion.ts) threw "Could not find the 'color' column ... in the
--     schema cache" and failed outright. Caught by tests/money-path-proposal-accept.spec.ts.
--   - tasks missing estimated_hours/actual_hours/schedule_item_id/tags — POST /api/tasks
--     inserts these columns unconditionally, so creating any task was broken.
--   - task_comments table didn't exist at all — GET/POST /api/tasks/[id]/comments 500s.
--   - actuals missing qb_bill_id/qb_vendor_id/po_number/payment_method/qb_synced — QB bill
--     sync (src/lib/quickbooks/client.ts:syncActualAsBill) writes qb_bill_id/qb_synced on
--     success, which would have failed once QB connect is eventually wired up.

-- ── schedule_items ──────────────────────────────────────────────────────────────
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS outlook_event_id      TEXT,
  ADD COLUMN IF NOT EXISTS outlook_calendar_id   TEXT,
  ADD COLUMN IF NOT EXISTS outlook_sync_status   TEXT NOT NULL DEFAULT 'not_synced'
    CHECK (outlook_sync_status IN ('not_synced','pending','synced','error')),
  ADD COLUMN IF NOT EXISTS outlook_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS percent_complete       INTEGER NOT NULL DEFAULT 0
    CHECK (percent_complete BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS trade                  TEXT,
  ADD COLUMN IF NOT EXISTS color                  TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_outlook ON public.schedule_items(outlook_event_id) WHERE outlook_event_id IS NOT NULL;

-- ── tasks ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours   NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS actual_hours      NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS schedule_item_id  UUID REFERENCES public.schedule_items(id),
  ADD COLUMN IF NOT EXISTS tags              TEXT[] NOT NULL DEFAULT '{}';

-- ── actuals ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.actuals
  ADD COLUMN IF NOT EXISTS qb_bill_id       TEXT,
  ADD COLUMN IF NOT EXISTS qb_vendor_id     TEXT,
  ADD COLUMN IF NOT EXISTS po_number        TEXT,
  ADD COLUMN IF NOT EXISTS payment_method   TEXT
    CHECK (payment_method IN ('check','credit_card','ach','cash','other')),
  ADD COLUMN IF NOT EXISTS qb_synced        BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_actuals_qb_bill ON public.actuals(qb_bill_id) WHERE qb_bill_id IS NOT NULL;

-- ── task_comments (table didn't exist at all) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_comments (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  job_id      UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  created_by  UUID        NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select" ON public.task_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_view = true)
);
CREATE POLICY "comments_insert" ON public.task_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_create = true)
);
CREATE POLICY "comments_update" ON public.task_comments FOR UPDATE USING (
  created_by = auth.uid()
);
CREATE POLICY "comments_delete" ON public.task_comments FOR DELETE USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);
