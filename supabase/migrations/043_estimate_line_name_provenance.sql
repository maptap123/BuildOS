-- BuildOS — Migration 043: a proposed line's name has to come from somewhere
--
-- JDC's 12,234 historical lines collapse to 699 distinct descriptions: a deliberate,
-- reused vocabulary ("Remove kitchen cabinet", "Remove gypsum wall & install header").
-- Nothing stopped Fixer from typing its own phrasing instead. The tools handed back
-- comp lines with no id, so it could only retype text from memory, which is an
-- invitation to paraphrase.
--
-- Now a proposal records WHICH row its name came from, and the server takes the name
-- from that row rather than from the model. A line Fixer cannot source is not silently
-- named: it arrives unsourced and unpriced for a human to fill in.
--
-- Note for anyone reading cost_catalog: the name is in `title`. Its `description`
-- column holds usage metadata ("Used in 445 estimate(s); last used 2026-05-15").

ALTER TABLE public.estimate_line_proposals
  -- The exact past line this name and price came from.
  ADD COLUMN IF NOT EXISTS source_line_id UUID
    REFERENCES public.historical_estimate_lines(id) ON DELETE SET NULL,
  -- Or the catalog entry, when priced off the cost book rather than a past job.
  ADD COLUMN IF NOT EXISTS cost_item_id UUID
    REFERENCES public.cost_catalog(id) ON DELETE SET NULL,
  -- 'sourced'  — description copied verbatim from a real row, or typed by a person.
  -- 'unsourced'— Fixer found no match; needs a name and a price before it can be used.
  ADD COLUMN IF NOT EXISTS name_status TEXT NOT NULL DEFAULT 'sourced'
    CHECK (name_status IN ('sourced','unsourced')),
  -- What Fixer would have called it. Shown as a hint only, never used as the name.
  ADD COLUMN IF NOT EXISTS suggested_description TEXT;

CREATE INDEX IF NOT EXISTS idx_line_proposals_name_status
  ON public.estimate_line_proposals(estimate_id, name_status);

-- Same provenance on the real line, so an approved line still points at its source.
ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS source_line_id UUID
    REFERENCES public.historical_estimate_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_lines_source_line
  ON public.estimate_lines(source_line_id);
