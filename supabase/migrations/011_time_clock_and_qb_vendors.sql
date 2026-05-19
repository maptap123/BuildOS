-- JDC Platform — Migration 011: Time Clock + QB vendor/employee links
-- Adds: time_entries table, hourly_rate on users, qb_vendor_id on contacts,
--       qb_employee_id on users, overtime settings

-- ─────────────────────────────────────────────
-- USERS: hourly rate + QB employee link
-- ─────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hourly_rate       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS overtime_rate     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS qb_employee_id    TEXT;

-- ─────────────────────────────────────────────
-- CONTACTS: QB vendor link
-- ─────────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS qb_vendor_id      TEXT;

-- ─────────────────────────────────────────────
-- TIME ENTRIES (Time Clock shifts)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id                    UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id                UUID          NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id               UUID          NOT NULL REFERENCES public.users(id),
  clock_in              TIMESTAMPTZ   NOT NULL,
  clock_out             TIMESTAMPTZ,
  regular_hours         NUMERIC(6,2)  NOT NULL DEFAULT 0,
  overtime_hours        NUMERIC(6,2)  NOT NULL DEFAULT 0,
  break_minutes         INTEGER       NOT NULL DEFAULT 0,
  cost_code             TEXT,
  hourly_rate           NUMERIC(8,2),
  overtime_rate         NUMERIC(8,2),
  labor_cost            NUMERIC(10,2) GENERATED ALWAYS AS (
                          COALESCE(regular_hours, 0) * COALESCE(hourly_rate, 0) +
                          COALESCE(overtime_hours, 0) * COALESCE(overtime_rate, hourly_rate, 0)
                        ) STORED,
  notes                 TEXT,
  tags                  TEXT[]        NOT NULL DEFAULT '{}',
  approval_status       TEXT          NOT NULL DEFAULT 'pending'
                          CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by           UUID          REFERENCES public.users(id),
  approved_at           TIMESTAMPTZ,
  qb_time_activity_id   TEXT,
  qb_synced             BOOLEAN       NOT NULL DEFAULT false,
  created_by            UUID          NOT NULL REFERENCES public.users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Field crew can see their own entries; admins see all
CREATE POLICY "te_select" ON public.time_entries FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- Any authenticated user can clock in/create a shift
CREATE POLICY "te_insert" ON public.time_entries FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Users can edit their own pending entries; admins can edit any
CREATE POLICY "te_update" ON public.time_entries FOR UPDATE USING (
  (user_id = auth.uid() AND approval_status = 'pending') OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- Admins only for delete
CREATE POLICY "te_delete" ON public.time_entries FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_time_entries_job_id         ON public.time_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id        ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in       ON public.time_entries(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_approval       ON public.time_entries(approval_status);
CREATE INDEX IF NOT EXISTS idx_time_entries_qb_synced      ON public.time_entries(qb_synced) WHERE NOT qb_synced;
CREATE INDEX IF NOT EXISTS idx_contacts_qb_vendor          ON public.contacts(qb_vendor_id) WHERE qb_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_qb_employee           ON public.users(qb_employee_id) WHERE qb_employee_id IS NOT NULL;
