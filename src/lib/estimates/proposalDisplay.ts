/**
 * Client-facing proposal display config — BuilderTrend "What to Display" parity.
 *
 * BuilderTrend keeps two layers: the internal worksheet (builder cost, markup,
 * margin, profit — never shown to the client) and the client-facing proposal,
 * where each column and the grouping/phases can be toggled. This mirrors that
 * client layer and drives BOTH the printed proposal and the public client link
 * so the two always match.
 *
 * The config lives in estimates.proposal_display (jsonb). When it is null we fall
 * back to the legacy show_line_details / show_cost_breakdown flags so existing
 * estimates render exactly as before.
 */

export type ProposalMode = 'itemized' | 'total_only'

export interface ProposalDisplay {
  /** itemized = show line items; total_only = client sees only the grand total (BT "Body: None"). */
  mode: ProposalMode
  // ── Per-line columns the client sees ────────────────────────────
  showItemTitle: boolean       // the line name (EstimateLine.description)
  showCostCode: boolean        // the cost code
  showDescription: boolean     // the extra detail note (EstimateLine.notes)
  showQtyUnit: boolean         // quantity + unit of measure
  showUnitPrice: boolean       // client unit price (marked-up), never raw cost
  showLineTotal: boolean       // client line total
  showLineNumbers: boolean     // a leading 1., 2., 3. column
  // ── Phases (BuilderTrend "groups") ──────────────────────────────
  showPhases: boolean          // group lines under phase headers
  showPhaseSubtotals: boolean  // show a subtotal per phase
  // ── Document sections ───────────────────────────────────────────
  showLetterhead: boolean      // JDC Construction masthead + PROPOSAL title
  showStatusBadge: boolean     // draft / sent / accepted pill
  showClientInfo: boolean      // "Prepared For" card (client name, email, phone, address)
  showProjectInfo: boolean     // "Project" card (title, address, job type)
  showProposalMeta: boolean    // "Proposal Details" card (dates, line count)
  showSummaryBar: boolean      // subtotal / markup / total bar above the table
  showScope: boolean           // the scope summary block
  showNotes: boolean           // the estimate notes block
  showHeaderText: boolean      // proposal_header_text block
  showFooterText: boolean      // proposal_footer_text block
  showTotalsBlock: boolean     // the totals box under the line item table
  showGrandTotal: boolean      // the grand total row / total line
  showTerms: boolean           // "Terms and Acceptance" section — OFF by default
  showSignature: boolean       // signature / printed name / date lines — OFF by default
  showPageFooter: boolean      // the small print footer at the bottom of the page
  /** Custom terms body. Null uses DEFAULT_TERMS. Only rendered when showTerms is on. */
  termsText: string | null
  // ── Advanced (BuilderTrend never exposes these; kept as an opt-in) ──
  showUnitCost: boolean        // raw builder unit cost
  showMarkup: boolean          // markup %
}

/** The boilerplate terms used when showTerms is on and no custom text was written. */
export const DEFAULT_TERMS: string[] = [
  'Proposal pricing is based on the scope and line items shown in this document.',
  'Changes outside this scope may require a written change order.',
  'Permits, allowances, taxes, and owner selections are included only where specifically listed.',
  'Schedule and start date are subject to final approval, material availability, and contract execution.',
]

/** Custom terms, one bullet per line — or the standard terms when nothing was written. */
export function splitTerms(termsText: string | null | undefined): string[] {
  const lines = (termsText ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.length > 0 ? lines : DEFAULT_TERMS
}

export const DEFAULT_PROPOSAL_DISPLAY: ProposalDisplay = {
  mode: 'itemized',
  showItemTitle: true,
  showCostCode: false,
  showDescription: true,
  showQtyUnit: true,
  showUnitPrice: true,
  showLineTotal: true,
  showLineNumbers: false,
  showPhases: true,
  showPhaseSubtotals: true,
  showLetterhead: true,
  showStatusBadge: true,
  showClientInfo: true,
  showProjectInfo: true,
  showProposalMeta: true,
  showSummaryBar: true,
  showScope: true,
  showNotes: true,
  showHeaderText: true,
  showFooterText: true,
  showTotalsBlock: true,
  showGrandTotal: true,
  // JDC sends proposals without the legal boilerplate and signature lines unless
  // the estimator deliberately turns them on for that proposal.
  showTerms: false,
  showSignature: false,
  showPageFooter: true,
  termsText: null,
  showUnitCost: false,
  showMarkup: false,
}

/** Minimal shape needed to resolve the config — avoids importing the full Estimate type. */
interface EstimateDisplaySource {
  proposal_display?: Partial<ProposalDisplay> | null
  show_line_details?: boolean | null
  show_cost_breakdown?: boolean | null
}

/**
 * Resolve the effective display config. Prefers the stored proposal_display, then
 * derives sensible values from the legacy flags so estimates saved before this
 * feature keep their previous appearance.
 *
 * Keys added after an estimate was last saved fall through to DEFAULT_PROPOSAL_DISPLAY,
 * which is what turns terms and signatures off on estimates saved before this change.
 */
export function resolveProposalDisplay(estimate: EstimateDisplaySource): ProposalDisplay {
  const stored = estimate.proposal_display ?? {}
  const legacyItemized = estimate.show_line_details !== false
  const legacyBreakdown = estimate.show_cost_breakdown === true

  const pick = <K extends keyof ProposalDisplay>(key: K, fallback: ProposalDisplay[K]): ProposalDisplay[K] =>
    stored[key] === undefined || stored[key] === null ? fallback : (stored[key] as ProposalDisplay[K])

  // Null and undefined both mean "not set" for the boolean keys, so they must not
  // survive the spread and blank out a default.
  const set = Object.fromEntries(
    Object.entries(stored).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<ProposalDisplay>

  return {
    ...DEFAULT_PROPOSAL_DISPLAY,
    ...set,
    // Keys with a legacy fallback have to be resolved explicitly — the spread above
    // only covers the ones whose default is already correct.
    mode: pick('mode', legacyItemized ? 'itemized' : 'total_only'),
    showItemTitle: pick('showItemTitle', true),
    showCostCode: pick('showCostCode', legacyBreakdown),
    showDescription: pick('showDescription', true),
    showQtyUnit: pick('showQtyUnit', legacyBreakdown),
    showUnitPrice: pick('showUnitPrice', true),
    showLineTotal: pick('showLineTotal', true),
    showPhases: pick('showPhases', true),
    showPhaseSubtotals: pick('showPhaseSubtotals', true),
    // termsText is a string, so null is a real value (use the default terms), not "unset".
    termsText: stored.termsText ?? null,
    // Legacy "cost breakdown" exposed unit cost + markup, so honor that on old rows.
    showUnitCost: pick('showUnitCost', legacyBreakdown),
    showMarkup: pick('showMarkup', legacyBreakdown),
  }
}

/** Every section toggle forced on — the internal worksheet always shows the full picture. */
export const INTERNAL_PROPOSAL_DISPLAY: ProposalDisplay = {
  ...DEFAULT_PROPOSAL_DISPLAY,
  mode: 'itemized',
  showItemTitle: true,
  showDescription: true,
  showCostCode: true,
  showQtyUnit: true,
  showUnitPrice: true,
  showLineTotal: true,
  showPhases: true,
  showPhaseSubtotals: true,
  showUnitCost: true,
  showMarkup: true,
}

/** Client-facing marked-up unit price for a line (never the raw builder cost). */
export function clientUnitPrice(line: { unit_cost: number | string; markup_pct: number | string }): number {
  return Number(line.unit_cost) * (1 + Number(line.markup_pct) / 100)
}

/** Client-facing line total (qty × marked-up unit price). */
export function clientLineTotal(line: { quantity: number | string; unit_cost: number | string; markup_pct: number | string }): number {
  return Number(line.quantity) * clientUnitPrice(line)
}
