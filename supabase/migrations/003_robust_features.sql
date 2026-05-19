-- JDC Platform — Migration 003: Robust Features
-- Adds: QB/Outlook integration fields, change orders, task comments,
--       integration settings, time tracking, phase/trade/progress fields

-- ─────────────────────────────────────────────
-- JOBS: QuickBooks integration fields
-- ─────────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS qb_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS qb_project_id     TEXT,
  ADD COLUMN IF NOT EXISTS qb_sync_status    TEXT NOT NULL DEFAULT 'not_synced'
    CHECK (qb_sync_status IN ('not_synced','pending','synced','error')),
  ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qb_sync_error     TEXT;

-- ─────────────────────────────────────────────
-- BUDGET LINES: Phase grouping + QB item ref
-- ─────────────────────────────────────────────
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS phase       TEXT,
  ADD COLUMN IF NOT EXISTS qb_item_id  TEXT;

-- ─────────────────────────────────────────────
-- ACTUALS: QB sync + PO + payment method
-- ─────────────────────────────────────────────
ALTER TABLE public.actuals
  ADD COLUMN IF NOT EXISTS qb_bill_id       TEXT,
  ADD COLUMN IF NOT EXISTS qb_vendor_id     TEXT,
  ADD COLUMN IF NOT EXISTS po_number        TEXT,
  ADD COLUMN IF NOT EXISTS payment_method   TEXT
    CHECK (payment_method IN ('check','credit_card','ach','cash','other')),
  ADD COLUMN IF NOT EXISTS qb_synced        BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- SCHEDULE ITEMS: Outlook sync + progress + trade
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- TASKS: Time tracking + schedule link + tags
-- ─────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours   NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS actual_hours      NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS schedule_item_id  UUID REFERENCES public.schedule_items(id),
  ADD COLUMN IF NOT EXISTS tags              TEXT[] NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────
-- CHANGE ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.change_orders (
  id               UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id           UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  co_number        TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  description      TEXT,
  status           TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','approved','rejected','voided')),
  type             TEXT        NOT NULL DEFAULT 'additive'
                     CHECK (type IN ('additive','deductive','neutral')),
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason           TEXT,
  submitted_date   DATE,
  approved_date    DATE,
  approved_by      UUID        REFERENCES public.users(id),
  budget_line_id   UUID        REFERENCES public.budget_lines(id),
  qb_estimate_id   TEXT,
  created_by       UUID        NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, co_number)
);

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_select" ON public.change_orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
CREATE POLICY "co_insert" ON public.change_orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);
CREATE POLICY "co_update" ON public.change_orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_edit = true)
);
CREATE POLICY "co_delete" ON public.change_orders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_delete = true)
);

-- ─────────────────────────────────────────────
-- TASK COMMENTS
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- INTEGRATION SETTINGS (QB, Outlook)
-- ─────────────────────────────────────────────
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

CREATE TRIGGER integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_admin_only" ON public.integration_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
  );

-- Seed default integration rows
INSERT INTO public.integration_settings (service, is_connected) VALUES
  ('quickbooks', false),
  ('outlook', false),
  ('google_calendar', false)
ON CONFLICT (service) DO NOTHING;

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_change_orders_job_id   ON public.change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id  ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_schedule_outlook       ON public.schedule_items(outlook_event_id) WHERE outlook_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_qb_customer       ON public.jobs(qb_customer_id) WHERE qb_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actuals_qb_bill        ON public.actuals(qb_bill_id) WHERE qb_bill_id IS NOT NULL;
