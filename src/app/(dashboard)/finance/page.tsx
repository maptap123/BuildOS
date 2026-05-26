import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FinanceDashboardClient } from '@/components/finance'
import type { FinanceJobRow } from '@/components/finance'

export const metadata = { title: 'Finance Overview — BuildOS' }

export default async function FinancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: financePerm }, { data: budgetPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'finance').single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'budget').single(),
  ])

  if (!financePerm?.can_view && !budgetPerm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view finance data.
      </div>
    )
  }

  const [
    { data: jobs },
    { data: budgetLines },
    { data: actuals },
  ] = await Promise.all([
    admin
      .from('jobs')
      .select('id, job_number, name, status, contract_amount, estimated_cost, qb_sync_status, qb_last_synced_at')
      .order('name'),
    admin
      .from('budget_lines')
      .select('job_id, original_budget'),
    admin
      .from('actuals')
      .select('job_id, amount, status')
      .in('status', ['approved', 'paid']),
  ])

  // Build lookup maps for O(1) per-job aggregation
  const budgetByJob = new Map<string, number>()
  for (const line of budgetLines ?? []) {
    budgetByJob.set(line.job_id, (budgetByJob.get(line.job_id) ?? 0) + (line.original_budget ?? 0))
  }

  const actualsByJob = new Map<string, number>()
  for (const actual of actuals ?? []) {
    actualsByJob.set(actual.job_id, (actualsByJob.get(actual.job_id) ?? 0) + (actual.amount ?? 0))
  }

  const rows: FinanceJobRow[] = (jobs ?? []).map((job) => {
    const budgetLinesSum = budgetByJob.get(job.id) ?? 0
    const estimatedCost  = budgetLinesSum > 0 ? budgetLinesSum : (job.estimated_cost ?? 0)

    return {
      id:               job.id,
      job_number:       job.job_number ?? '',
      name:             job.name ?? '',
      status:           job.status,
      contract_amount:  job.contract_amount ?? 0,
      estimated_cost:   estimatedCost,
      actuals_total:    actualsByJob.get(job.id) ?? 0,
      qb_sync_status:   job.qb_sync_status ?? 'not_synced',
      qb_last_synced_at: job.qb_last_synced_at ?? null,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900">Finance Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Cross-job financial command center</p>
      </div>
      <FinanceDashboardClient jobs={rows} />
    </div>
  )
}
