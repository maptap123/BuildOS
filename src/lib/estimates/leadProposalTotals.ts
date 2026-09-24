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
 * client has signed, otherwise the newest version. Matches the proposal total the client sees —
 * marked-up, client-visible lines only. Leads with no priced estimate are left out.
 */
export async function leadProposalTotals(admin: SupabaseClient, leadIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  if (leadIds.length === 0) return totals

  // Lines are embedded, so only the estimate rows count toward PostgREST's row cap.
  const { data } = await admin
    .from('estimates')
    .select('lead_id, status, version, estimate_lines(quantity, unit_cost, markup_pct, client_visible)')
    .in('lead_id', leadIds)

  const chosen = new Map<string, EstimateRow>()
  for (const est of (data ?? []) as EstimateRow[]) {
    const current = chosen.get(est.lead_id)
    const rank = (e: EstimateRow) => [e.status === 'approved' ? 1 : 0, e.version]
    if (!current) {
      chosen.set(est.lead_id, est)
      continue
    }
    const [aApproved, aVersion] = rank(est)
    const [bApproved, bVersion] = rank(current)
    if (aApproved > bApproved || (aApproved === bApproved && aVersion > bVersion)) chosen.set(est.lead_id, est)
  }

  for (const [leadId, est] of chosen) {
    const total = est.estimate_lines
      .filter(line => line.client_visible !== false)
      .reduce((sum, line) => sum + clientLineTotal(line), 0)
    // An estimate with nothing priced yet says nothing about the lead's value.
    if (total > 0) totals.set(leadId, total)
  }
  return totals
}
