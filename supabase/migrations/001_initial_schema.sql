-- JDC Platform — Initial Schema
-- Run this in the Supabase dashboard SQL Editor

-- ─────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- USERS (extends auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE public.users (
  id              UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email           TEXT        NOT NULL,
  full_name       TEXT,
  phone           TEXT,
  company_name    TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  last_sign_in_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- USER PERMISSIONS
-- ─────────────────────────────────────────────
CREATE TABLE public.user_permissions (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module     TEXT        NOT NULL CHECK (module IN ('jobs','budget','schedule','tasks','logs','documents','admin','ai')),
  can_view   BOOLEAN     NOT NULL DEFAULT false,
  can_create BOOLEAN     NOT NULL DEFAULT false,
  can_edit   BOOLEAN     NOT NULL DEFAULT false,
  can_delete BOOLEAN     NOT NULL DEFAULT false,
  can_export BOOLEAN     NOT NULL DEFAULT false,
  can_manage BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module)
);

CREATE TRIGGER user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- JOBS
-- ─────────────────────────────────────────────
CREATE TABLE public.jobs (
  id                     UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_number             TEXT        NOT NULL UNIQUE,
  name                   TEXT        NOT NULL,
  description            TEXT,
  client_name            TEXT        NOT NULL,
  client_email           TEXT,
  client_phone           TEXT,
  site_address           TEXT        NOT NULL,
  city                   TEXT,
  state                  TEXT,
  postal_code            TEXT,
  status                 TEXT        NOT NULL DEFAULT 'lead'
                           CHECK (status IN ('lead','estimating','scheduled','active','on_hold','completed','closed')),
  start_date             DATE,
  target_completion_date DATE,
  actual_completion_date DATE,
  contract_amount        NUMERIC(12,2),
  estimated_cost         NUMERIC(12,2),
  project_manager_id     UUID        REFERENCES public.users(id),
  superintendent_id      UUID        REFERENCES public.users(id),
  created_by             UUID        NOT NULL REFERENCES public.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- BUDGET LINES
-- ─────────────────────────────────────────────
CREATE TABLE public.budget_lines (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id          UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  cost_code       TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','change_order','closed')),
  original_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  revised_budget  NUMERIC(12,2) NOT NULL DEFAULT 0,
  committed_cost  NUMERIC(12,2) NOT NULL DEFAULT 0,
  forecast_cost   NUMERIC(12,2),
  notes           TEXT,
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER budget_lines_updated_at
  BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- ACTUALS
-- ─────────────────────────────────────────────
CREATE TABLE public.actuals (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id          UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  budget_line_id  UUID        REFERENCES public.budget_lines(id),
  vendor_name     TEXT,
  invoice_number  TEXT,
  description     TEXT        NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid')),
  incurred_date   DATE        NOT NULL,
  approved_by     UUID        REFERENCES public.users(id),
  approved_at     TIMESTAMPTZ,
  document_id     UUID,
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER actuals_updated_at
  BEFORE UPDATE ON public.actuals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- SCHEDULE ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE public.schedule_items (
  id               UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id           UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  status           TEXT        NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','blocked','completed','delayed')),
  start_date       DATE        NOT NULL,
  end_date         DATE        NOT NULL,
  all_day          BOOLEAN     NOT NULL DEFAULT true,
  assigned_user_id UUID        REFERENCES public.users(id),
  predecessor_id   UUID        REFERENCES public.schedule_items(id),
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_by       UUID        NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER schedule_items_updated_at
  BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- TASKS
-- ─────────────────────────────────────────────
CREATE TABLE public.tasks (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id       UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo','in_progress','blocked','done','archived')),
  priority     TEXT        NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to  UUID        REFERENCES public.users(id),
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID        REFERENCES public.users(id),
  created_by   UUID        NOT NULL REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- DAILY LOGS
-- ─────────────────────────────────────────────
CREATE TABLE public.daily_logs (
  id                UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id            UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  log_date          DATE        NOT NULL,
  weather_summary   TEXT,
  temperature_high  NUMERIC(4,1),
  temperature_low   NUMERIC(4,1),
  manpower_count    INTEGER,
  work_performed    TEXT        NOT NULL,
  delays            TEXT,
  safety_notes      TEXT,
  inspection_notes  TEXT,
  ai_summary        TEXT,
  created_by        UUID        NOT NULL REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, log_date)
);

CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────────
CREATE TABLE public.documents (
  id                UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id            UUID        REFERENCES public.jobs(id) ON DELETE CASCADE,
  module            TEXT        NOT NULL CHECK (module IN ('job','budget','schedule','task','daily_log','admin')),
  related_record_id UUID,
  file_name         TEXT        NOT NULL,
  file_path         TEXT        NOT NULL,
  file_type         TEXT        NOT NULL,
  file_size         INTEGER     NOT NULL,
  storage_bucket    TEXT        NOT NULL DEFAULT 'documents',
  uploaded_by       UUID        NOT NULL REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actuals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents         ENABLE ROW LEVEL SECURITY;

-- Users: read own profile
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Users: admins read/write all
CREATE POLICY "admins_all_users" ON public.users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true
    )
  );

-- Permissions: each user reads their own
CREATE POLICY "permissions_read_own" ON public.user_permissions
  FOR SELECT USING (user_id = auth.uid());

-- Permissions: admins manage all
CREATE POLICY "admins_manage_permissions" ON public.user_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid() AND up.module = 'admin' AND up.can_manage = true
    )
  );

-- Jobs: permission-gated
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_view = true)
);
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_create = true)
);
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_edit = true)
);
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_delete = true)
);

-- Budget lines
CREATE POLICY "budget_select" ON public.budget_lines FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
CREATE POLICY "budget_insert" ON public.budget_lines FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);
CREATE POLICY "budget_update" ON public.budget_lines FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_edit = true)
);

-- Schedule items
CREATE POLICY "schedule_select" ON public.schedule_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'schedule' AND can_view = true)
);
CREATE POLICY "schedule_insert" ON public.schedule_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'schedule' AND can_create = true)
);
CREATE POLICY "schedule_update" ON public.schedule_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'schedule' AND can_edit = true)
);

-- Tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_view = true)
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_create = true)
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_edit = true)
);

-- Daily logs
CREATE POLICY "logs_select" ON public.daily_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_view = true)
);
CREATE POLICY "logs_insert" ON public.daily_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_create = true)
);
CREATE POLICY "logs_update" ON public.daily_logs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_edit = true)
);

-- Documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'documents' AND can_view = true)
);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'documents' AND can_create = true)
);
