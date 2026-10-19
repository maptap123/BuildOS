import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AllowanceSummary, Selection, SelectionChangeOrder, SelectionEstimateLine, SelectionsBoard,
} from '@/types'
import { syncAllowancesFromEstimate } from './allowances'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Everything the Selections page shows for one job. Syncs the estimate's allowances
 * first, so an allowance typed on the estimate a minute ago is already here.
 */
export async function loadSelectionsBoard(
  admin: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<SelectionsBoard> {
  const { estimate } = await syncAllowancesFromEstimate(admin, jobId, userId)

  const [{ data: allowanceRows }, { data: selectionRows }, { data: coRows }, { data: vendorRows }, { data: lineRows }] =
    await Promise.all([
      admin.from('allowances').select('*').eq('job_id', jobId).order('created_at'),
      admin
        .from('selections')
        .select('*, choices:selection_choices(*, vendor:vendors(id, name), selected_by_user:selected_by(full_name))')
        .eq('job_id', jobId)
        .order('sort_order')
        .order('created_at'),
      admin
        .from('change_orders')
        .select('id, co_number, title, status, amount, client_token, allowance_id')
        .eq('job_id', jobId)
        .not('allowance_id', 'is', null)
        .order('co_number'),
      admin.from('vendors').select('id, name').eq('is_active', true).order('name'),
      estimate
        ? admin
            .from('estimate_lines')
            .select('id, description, cost_code')
            .eq('estimate_id', estimate.id)
            .order('sort_order')
        : Promise.resolve({ data: [] as { id: string; description: string; cost_code: string | null }[] }),
    ])

  const selections = ((selectionRows ?? []) as Selection[]).map(s => ({
    ...s,
    choices: [...(s.choices ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }))

  const spentBy = new Map<string, number>()
  const countBy = new Map<string, number>()
  for (const s of selections) {
    if (!s.allowance_id) continue
    countBy.set(s.allowance_id, (countBy.get(s.allowance_id) ?? 0) + 1)
    const picked = s.choices.find(c => c.is_selected)
    if (picked) spentBy.set(s.allowance_id, (spentBy.get(s.allowance_id) ?? 0) + Number(picked.client_price))
  }

  const allowances: AllowanceSummary[] = (allowanceRows ?? []).map(a => {
    const spent = round2(spentBy.get(a.id) ?? 0)
    return {
      ...a,
      amount: Number(a.amount),
      spent,
      remaining: round2(Number(a.amount) - spent),
      selection_count: countBy.get(a.id) ?? 0,
    }
  })

  const allowanceByLine = new Map(
    allowances.filter(a => a.estimate_line_id).map(a => [a.estimate_line_id as string, a.id]))
  const estimateLines: SelectionEstimateLine[] = (lineRows ?? []).map(l => ({
    id: l.id,
    description: l.description,
    cost_code: l.cost_code,
    allowance_id: allowanceByLine.get(l.id) ?? null,
  }))

  return {
    estimate: estimate
      ? { id: estimate.id, title: estimate.title, version: estimate.version, status: estimate.status }
      : null,
    allowances,
    selections,
    estimateLines,
    changeOrders: (coRows ?? []).map(c => ({ ...c, amount: Number(c.amount) })) as SelectionChangeOrder[],
    vendors: vendorRows ?? [],
  }
}
