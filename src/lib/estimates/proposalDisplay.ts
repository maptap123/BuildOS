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
  // ── Phases (BuilderTrend "groups") ──────────────────────────────
  showPhases: boolean          // group lines under phase headers
  showPhaseSubtotals: boolean  // show a subtotal per phase
  // ── Advanced (BuilderTrend never exposes these; kept as an opt-in) ──
  showUnitCost: boolean        // raw builder unit cost
  showMarkup: boolean          // markup %
}

export const DEFAULT_PROPOSAL_DISPLAY: ProposalDisplay = {
  mode: 'itemized',
  showItemTitle: true,
  showCostCode: false,
  showDescription: true,
  showQtyUnit: true,
  showUnitPrice: true,
  showLineTotal: true,
  showPhases: true,
  showPhaseSubtotals: true,
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
 */
export function resolveProposalDisplay(estimate: EstimateDisplaySource): ProposalDisplay {
  const stored = estimate.proposal_display ?? {}
  const legacyItemized = estimate.show_line_details !== false
  const legacyBreakdown = estimate.show_cost_breakdown === true

  const pick = <K extends keyof ProposalDisplay>(key: K, fallback: ProposalDisplay[K]): ProposalDisplay[K] =>
    stored[key] === undefined || stored[key] === null ? fallback : (stored[key] as ProposalDisplay[K])

  return {
    mode: pick('mode', legacyItemized ? 'itemized' : 'total_only'),
    showItemTitle: pick('showItemTitle', true),
    showCostCode: pick('showCostCode', legacyBreakdown),
    showDescription: pick('showDescription', true),
    showQtyUnit: pick('showQtyUnit', legacyBreakdown),
    showUnitPrice: pick('showUnitPrice', true),
    showLineTotal: pick('showLineTotal', true),
    showPhases: pick('showPhases', true),
    showPhaseSubtotals: pick('showPhaseSubtotals', true),
    // Legacy "cost breakdown" exposed unit cost + markup, so honor that on old rows.
    showUnitCost: pick('showUnitCost', legacyBreakdown),
    showMarkup: pick('showMarkup', legacyBreakdown),
  }
}

/** Client-facing marked-up unit price for a line (never the raw builder cost). */
export function clientUnitPrice(line: { unit_cost: number | string; markup_pct: number | string }): number {
  return Number(line.unit_cost) * (1 + Number(line.markup_pct) / 100)
}

/** Client-facing line total (qty × marked-up unit price). */
export function clientLineTotal(line: { quantity: number | string; unit_cost: number | string; markup_pct: number | string }): number {
  return Number(line.quantity) * clientUnitPrice(line)
}
