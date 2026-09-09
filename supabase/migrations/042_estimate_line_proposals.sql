-- BuildOS — Migration 042: Fixer's estimate lines go to a holding area first
--
-- Fixer priced straight into estimate_lines: the tool wrote the rows and the estimator
-- found out by reloading the page. Nothing was reviewable and nothing recorded which
-- past job a number came from once the chat scrolled away.
--
-- Now the Estimate Builder's own Fixer panel opens a short-lived session before each
-- turn. While one is open, add_estimate_lines stages into estimate_line_proposals
-- instead, the panel renders them with their comp attribution, and the estimator
-- decides line by line what lands on the estimate. With no session open — SMS, the
-- floating panel — the tool writes directly, exactly as before.
--
-- Keying the session on estimate_id rather than user is deliberate: /api/agent runs as
-- the shared Hermes service user, so there is no estimator identity on the tool call.

-- ─────────────────────────────────────────────
-- PROPOSAL SESSIONS  (one open estimate per row; self-expiring)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_proposal_sessions (
  estimate_id  UUID        PRIMARY KEY REFERENCES public.estimates(id) ON DELETE CASCADE,
  requested_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  -- Short by design. If a turn dies, the window closes on its own rather than silently
  -- diverting a later SMS-driven write into a queue nobody is watching.
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_expires
  ON public.estimate_proposal_sessions(expires_at);

-- ─────────────────────────────────────────────
-- PROPOSED LINES  (mirrors estimate_lines, plus where the price came from)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_line_proposals (
  id               UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  estimate_id      UUID        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  -- One turn's worth of lines. The panel reviews and discards by batch.
  batch_id         UUID        NOT NULL,

  description      TEXT        NOT NULL,
  phase            TEXT,
  cost_code        TEXT,
  uom              TEXT        NOT NULL DEFAULT 'EA',
  quantity         NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_cost        NUMERIC(12,4) NOT NULL DEFAULT 0,
  markup_pct       NUMERIC(6,2)  NOT NULL DEFAULT 0,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  -- Provenance. comp_label is denormalised so the review list needs no join and still
  -- reads correctly if the historical estimate is later re-imported.
  source           TEXT        CHECK (source IS NULL OR source IN ('ai_comp','ai_market')),
  comp_job_id      UUID        REFERENCES public.jobs(id) ON DELETE SET NULL,
  comp_estimate_id UUID        REFERENCES public.historical_estimates(id) ON DELETE SET NULL,
  comp_label       TEXT,
  ai_rationale     TEXT,

  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','applied','discarded')),
  applied_line_id  UUID        REFERENCES public.estimate_lines(id) ON DELETE SET NULL,
  decided_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_proposals_estimate_status
  ON public.estimate_line_proposals(estimate_id, status);
CREATE INDEX IF NOT EXISTS idx_line_proposals_batch
  ON public.estimate_line_proposals(batch_id);

-- ─────────────────────────────────────────────
-- RLS — follows the budget module, same as estimate_lines (migration 017).
-- The agent writes with the admin client; these policies cover the estimator's
-- own reads and the apply/discard decisions made from the builder.
-- ─────────────────────────────────────────────
ALTER TABLE public.estimate_line_proposals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_proposal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_line_proposals_select" ON public.estimate_line_proposals;
CREATE POLICY "estimate_line_proposals_select" ON public.estimate_line_proposals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions
          WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);

DROP POLICY IF EXISTS "estimate_line_proposals_update" ON public.estimate_line_proposals;
CREATE POLICY "estimate_line_proposals_update" ON public.estimate_line_proposals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions
          WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);

DROP POLICY IF EXISTS "estimate_proposal_sessions_select" ON public.estimate_proposal_sessions;
CREATE POLICY "estimate_proposal_sessions_select" ON public.estimate_proposal_sessions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions
          WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
