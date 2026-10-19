-- JDC Platform — Migration 059: Selections + allowances
-- The client's finish decisions (vanity, faucet, flooring), each drawing from an
-- allowance. Allowances are pulled from the allowance lines on the job's estimate
-- (estimate_lines.allowance, migration 058), so nothing is typed twice. A selected
-- choice that takes an allowance over drafts an additive change order for the overage.
--
-- Tree: allowances ← selections ← selection_choices. Spent and remaining are computed
-- from the selected choices, never stored.
-- All access goes through the API with the service role: RLS on, no policies.

-- ─────────────────────────────────────────────
-- ALLOWANCES — one per estimate allowance line (source 'estimate'), or added by
-- hand from a new selection (source 'manual'). A manual allowance on a code that was
-- fixed-price in the contract is internal tracking only — the client signs nothing.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allowances (
  id               UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id           UUID          NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title            TEXT          NOT NULL,
  cost_code        TEXT,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  source           TEXT          NOT NULL DEFAULT 'manual' CHECK (source IN ('estimate','manual')),
  estimate_line_id UUID          REFERENCES public.estimate_lines(id) ON DELETE SET NULL,
  -- The estimate's own words ("$525 Allowance"); amount is read out of them.
  allowance_text   TEXT,
  -- No dollar amount could be read from allowance_text ("TBD").
  needs_review     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS allowances_job_idx ON public.allowances (job_id);
-- One allowance per estimate line, whichever way it was created.
CREATE UNIQUE INDEX IF NOT EXISTS allowances_job_estimate_line_key
  ON public.allowances (job_id, estimate_line_id) WHERE estimate_line_id IS NOT NULL;

CREATE TRIGGER allowances_updated_at
  BEFORE UPDATE ON public.allowances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.allowances ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- SELECTIONS — a decision the client makes. Several may share one allowance.
-- pending → selected (a choice is picked) → ordered → installed.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.selections (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id        UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  allowance_id  UUID        REFERENCES public.allowances(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  cost_code     TEXT,
  location      TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','selected','ordered','installed')),
  instructions  TEXT,
  deadline      DATE,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS selections_job_idx ON public.selections (job_id);
CREATE INDEX IF NOT EXISTS selections_allowance_idx ON public.selections (allowance_id);

CREATE TRIGGER selections_updated_at
  BEFORE UPDATE ON public.selections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- CHOICES — one option for a selection. client_price is what counts against the
-- allowance; builder_cost is JDC's cost, never shown to the client.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.selection_choices (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  selection_id  UUID          NOT NULL REFERENCES public.selections(id) ON DELETE CASCADE,
  title         TEXT          NOT NULL,
  details       TEXT,
  product_url   TEXT,
  vendor_id     UUID          REFERENCES public.vendors(id) ON DELETE SET NULL,
  client_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  builder_cost  NUMERIC(12,2),
  is_selected   BOOLEAN       NOT NULL DEFAULT FALSE,
  selected_by   UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  selected_at   TIMESTAMPTZ,
  created_by    UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS selection_choices_selection_idx ON public.selection_choices (selection_id);
-- At most one picked choice per selection.
CREATE UNIQUE INDEX IF NOT EXISTS selection_choices_one_selected
  ON public.selection_choices (selection_id) WHERE is_selected;

CREATE TRIGGER selection_choices_updated_at
  BEFORE UPDATE ON public.selection_choices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.selection_choices ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- Overage change orders remember which allowance they bill for, so a later pick
-- updates the open draft instead of stacking up new ones.
-- ─────────────────────────────────────────────
ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS allowance_id UUID REFERENCES public.allowances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS change_orders_allowance_idx ON public.change_orders (allowance_id);
