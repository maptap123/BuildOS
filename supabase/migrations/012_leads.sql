-- Run: supabase db push  (or apply via Supabase dashboard SQL editor)
-- JDC Platform — Migration 012: Leads / CRM Pipeline
-- Creates leads and lead_activities tables with RLS policies.

-- ─────────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  title           TEXT        NOT NULL,
  client_name     TEXT,
  client_email    TEXT,
  client_phone    TEXT,
  source          TEXT,  -- 'referral','website','cold_call','repeat','other'
  status          TEXT        NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','proposal','won','lost')),
  estimated_value NUMERIC(12,2),
  notes           TEXT,
  address         TEXT,
  assigned_to     UUID        REFERENCES public.users(id),
  converted_job_id UUID       REFERENCES public.jobs(id),
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_view = true)
);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_create = true)
);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_edit = true)
);
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_delete = true)
);

CREATE INDEX IF NOT EXISTS idx_leads_status     ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);

-- ─────────────────────────────────────────────
-- LEAD ACTIVITIES (follow-up notes)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id    UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  note       TEXT        NOT NULL,
  created_by UUID        NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_select" ON public.lead_activities FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_view = true)
);
CREATE POLICY "lead_activities_insert" ON public.lead_activities FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'jobs' AND can_create = true)
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.lead_activities(lead_id);
