-- BuilderTrend-parity client-visibility config for proposals.
-- One JSONB blob so the option set can grow without a migration each time.
-- NULL = fall back to the legacy show_line_details / show_cost_breakdown flags in code
-- (see src/lib/estimates/proposalDisplay.ts::resolveProposalDisplay).
alter table public.estimates
  add column if not exists proposal_display jsonb;

comment on column public.estimates.proposal_display is
  'Client-facing proposal display config (BuilderTrend "What to Display" parity). Keys: mode (itemized|total_only), showItemTitle, showCostCode, showDescription, showQtyUnit, showUnitPrice, showLineTotal, showPhases, showPhaseSubtotals, showUnitCost, showMarkup. NULL falls back to show_line_details/show_cost_breakdown.';
