import type { SupabaseClient } from '@supabase/supabase-js'
import { clientLineTotal } from './proposalDisplay'

type EstimateRow = {
  lead_id: string
  status: string
  version: number
  estimate_lines: { quantity: number | string; unit_cost: number | string; markup_pct: number | string; client_visible: boolean | null }[]
}

/**
 * The proposal amount for each lead, priced live from its estimate: the accepted one if the
 * client has signed, otherwise the newest version that has a positive client-visible price.
 * Matches the proposal total the client sees — marked-up, client-visible lines only.
 * Leads with no priced estimate are left out.
 *
 * Selection precedence (per lead):
 *   1. Highest-version approved estimate (regardless of price — preserves accepted behaviour)
 *   2. Otherwise: highest-version estimate with total > 0 (empty/unpriced drafts are skipped)
 */
export async function leadProposalTotals(admin: SupabaseClient, leadIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  if (leadIds.length === 0) return totals

  // Lines are embedded, so only the estimate rows count toward PostgREST's row cap.
  const { data } = await admin
    .from('estimates')
    .select('lead_id, status, version, estimate_lines(quantity, unit_cost, markup_pct, client_visible)')
    .in('lead_id', leadIds)

  // Compute client-visible total per estimate up-front so selection can use it.
  const rows = (data ?? []) as EstimateRow[]

  function computeTotal(est: EstimateRow): number {
    return est.estimate_lines
      .filter(line => line.client_visible !== false)
      .reduce((sum, line) => sum + clientLineTotal(line), 0)
  }

  // For each lead, track the best approved candidate and the best priced non-approved.
  const bestApproved = new Map<string, EstimateRow>()
  const bestPriced   = new Map<string, EstimateRow>()

  for (const est of rows) {
    if (est.status === 'approved') {
      const cur = bestApproved.get(est.lead_id)
      if (!cur || est.version > cur.version) bestApproved.set(est.lead_id, est)
    } else {
      // Only contend for the "best priced" slot if the estimate has a positive total.
      const total = computeTotal(est)
      if (total > 0) {
        const cur = bestPriced.get(est.lead_id)
        if (!cur || est.version > cur.version) bestPriced.set(est.lead_id, est)
      }
    }
  }

  // Approved always wins; fall back to best priced non-approved.
  const allLeadIds = new Set([...bestApproved.keys(), ...bestPriced.keys()])
  for (const leadId of allLeadIds) {
    const chosen = bestApproved.get(leadId) ?? bestPriced.get(leadId)!
    const total  = computeTotal(chosen)
    if (total > 0) totals.set(leadId, total)
  }

  return totals
}
