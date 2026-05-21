-- Migration: Proposal visibility controls
-- Adds per-line client visibility toggle and per-estimate proposal settings

ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_note TEXT;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS show_line_details BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_cost_breakdown BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposal_header_text TEXT,
  ADD COLUMN IF NOT EXISTS proposal_footer_text TEXT;
