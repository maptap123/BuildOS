-- Proposal display config grew a second layer of options: which SECTIONS of the
-- document render, not just which line item columns. No schema change — the config
-- is jsonb — so this only refreshes the column comment so the key list stays honest.
--
-- Keys absent from a stored config fall back to DEFAULT_PROPOSAL_DISPLAY in
-- src/lib/estimates/proposalDisplay.ts, which is what turns terms and signature
-- lines off on estimates saved before this change.
comment on column public.estimates.proposal_display is
  'Client-facing proposal display config (BuilderTrend "What to Display" parity). '
  'Layout: mode (itemized|total_only). '
  'Line columns: showItemTitle, showCostCode, showDescription, showQtyUnit, showUnitPrice, showLineTotal, showLineNumbers. '
  'Phases: showPhases, showPhaseSubtotals. '
  'Sections: showLetterhead, showStatusBadge, showClientInfo, showProjectInfo, showProposalMeta, showSummaryBar, '
  'showScope, showNotes, showHeaderText, showFooterText, showTotalsBlock, showGrandTotal, showPageFooter. '
  'Terms: showTerms (default false), showSignature (default false), termsText (null = standard JDC terms). '
  'Advanced: showUnitCost, showMarkup. '
  'NULL falls back to show_line_details/show_cost_breakdown; missing keys fall back to DEFAULT_PROPOSAL_DISPLAY.';
