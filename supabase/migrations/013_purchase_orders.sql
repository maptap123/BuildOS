-- JDC Platform — Purchase Orders
-- Run: supabase db push

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id          UUID          NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  budget_line_id  UUID          REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  vendor_name     TEXT          NOT NULL,
  po_number       TEXT,
  description     TEXT          NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','received','closed','cancelled')),
  issued_date     DATE,
  expected_date   DATE,
  notes           TEXT,
  created_by      UUID          NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
CREATE POLICY "po_insert" ON public.purchase_orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);
CREATE POLICY "po_update" ON public.purchase_orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_edit = true)
);
CREATE POLICY "po_delete" ON public.purchase_orders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_delete = true)
);

CREATE INDEX IF NOT EXISTS idx_po_job_id         ON public.purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_po_budget_line_id ON public.purchase_orders(budget_line_id);
