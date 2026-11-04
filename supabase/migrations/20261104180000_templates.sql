-- Template system (modeled on BuilderTrend's Job Templates, Lead Activity templates and
-- Lien Waiver forms). All access goes through service-role API routes, so RLS is on with no policies.
--
-- Offsets are in WORK DAYS from the template's start day (day 0), so a template is
-- date-independent; applying it to a job walks the calendar skipping the template's work_days.

CREATE TABLE IF NOT EXISTS public.job_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  color         text,
  work_days     jsonb NOT NULL DEFAULT '{"sunday":false,"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true,"saturday":false}',
  internal_notes text,
  sub_notes     text,
  bt_template_id text UNIQUE,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_template_schedule_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  title         text NOT NULL,
  notes         text,
  start_offset  integer NOT NULL DEFAULT 0 CHECK (start_offset >= 0),
  duration      integer NOT NULL DEFAULT 1 CHECK (duration >= 1),
  item_type     text NOT NULL DEFAULT 'phase' CHECK (item_type IN ('phase','milestone')),
  color         text,
  trade         text,
  assignees     text[] NOT NULL DEFAULT '{}',
  -- [{ "item_id": "<template schedule item uuid>", "type": "FS|SS|FF|SF", "lag_days": 0 }]
  predecessors  jsonb NOT NULL DEFAULT '[]',
  sort_order    integer NOT NULL DEFAULT 0,
  bt_id         text
);
CREATE INDEX IF NOT EXISTS job_template_schedule_items_tpl ON public.job_template_schedule_items(template_id);

CREATE TABLE IF NOT EXISTS public.job_template_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES public.job_template_tasks(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_offset    integer CHECK (due_offset IS NULL OR due_offset >= 0),
  assignees     text[] NOT NULL DEFAULT '{}',
  schedule_item_id uuid REFERENCES public.job_template_schedule_items(id) ON DELETE SET NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  bt_id         text
);
CREATE INDEX IF NOT EXISTS job_template_tasks_tpl ON public.job_template_tasks(template_id);

CREATE TABLE IF NOT EXISTS public.job_template_selections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  title         text NOT NULL,
  cost_code     text,
  location      text,
  instructions  text,
  deadline_offset integer CHECK (deadline_offset IS NULL OR deadline_offset >= 0),
  vendor_names  text[] NOT NULL DEFAULT '{}',
  sort_order    integer NOT NULL DEFAULT 0,
  bt_id         text
);
CREATE INDEX IF NOT EXISTS job_template_selections_tpl ON public.job_template_selections(template_id);

-- Lead activity templates: a sequence of follow-ups/emails laid down on a lead.
CREATE TABLE IF NOT EXISTS public.activity_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  -- [{ "kind": "email|follow-up|call|meeting|...", "title": "", "offset_days": 0,
  --    "subject": "", "body": "", "assign_to": "salesperson|<full name>" }]
  steps         jsonb NOT NULL DEFAULT '[]',
  bt_template_id text UNIQUE,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Reusable text documents with {{variables}}: lien waivers, email boilerplate, proposal intro/closing...
CREATE TABLE IF NOT EXISTS public.document_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('lien_waiver','email','proposal_intro','proposal_closing','other')),
  name          text NOT NULL,
  body          text NOT NULL DEFAULT '',
  is_default    boolean NOT NULL DEFAULT false,
  bt_template_id text UNIQUE,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_template_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_template_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
