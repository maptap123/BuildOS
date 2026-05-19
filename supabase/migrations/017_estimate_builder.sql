-- JDC Platform — Migration 016: Estimate Builder
-- Creates cost_catalog and estimate_lines tables, adds lead_id to estimates.

-- ─────────────────────────────────────────────
-- COST CATALOG  (the 4,600-row cost book)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_catalog (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  cost_code     TEXT        NOT NULL,
  division_num  TEXT        NOT NULL,   -- e.g. "03"
  division_name TEXT        NOT NULL,   -- e.g. "Concrete"
  phase         TEXT,                   -- e.g. "Rough", "Finish"
  title         TEXT        NOT NULL,
  description   TEXT,
  uom           TEXT        NOT NULL DEFAULT 'EA',
  unit_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
  labor_cost    NUMERIC(12,4) NOT NULL DEFAULT 0,
  material_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  cost_type     TEXT,                   -- 'labor','material','subcontractor','equipment','other'
  taxable       BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_catalog_division ON public.cost_catalog(division_num);
CREATE INDEX IF NOT EXISTS idx_cost_catalog_phase    ON public.cost_catalog(phase);
CREATE INDEX IF NOT EXISTS idx_cost_catalog_search   ON public.cost_catalog USING gin(to_tsvector('english', title || ' ' || COALESCE(description,'') || ' ' || cost_code));

ALTER TABLE public.cost_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_catalog_select" ON public.cost_catalog FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);

-- ─────────────────────────────────────────────
-- Add lead_id to existing estimates table
-- ─────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title   TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes   TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_estimates_lead_id ON public.estimates(lead_id);

-- ─────────────────────────────────────────────
-- ESTIMATE LINES  (the per-lead line items)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_lines (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  estimate_id    UUID        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES public.leads(id)     ON DELETE CASCADE,
  cost_item_id   UUID        REFERENCES public.cost_catalog(id),
  description    TEXT        NOT NULL,
  phase          TEXT,
  cost_code      TEXT,
  uom            TEXT        NOT NULL DEFAULT 'EA',
  quantity       NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_cost      NUMERIC(12,4) NOT NULL DEFAULT 0,
  markup_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_estimate_id ON public.estimate_lines(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_lines_lead_id     ON public.estimate_lines(lead_id);

ALTER TABLE public.estimate_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_lines_select" ON public.estimate_lines FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
CREATE POLICY "estimate_lines_insert" ON public.estimate_lines FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);
CREATE POLICY "estimate_lines_update" ON public.estimate_lines FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_edit = true)
);
CREATE POLICY "estimate_lines_delete" ON public.estimate_lines FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_delete = true)
);

-- updated_at trigger
CREATE TRIGGER estimate_lines_updated_at
  BEFORE UPDATE ON public.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
