import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BudgetClient } from '@/components/budget'

export default async function JobBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view budget data.
      </div>
    )
  }

  const [{ data: job }, { data: lines }, { data: actuals }, { data: changeOrders }] = await Promise.all([
    admin
      .from('jobs')
      .select('id, lead_id, contract_amount, estimated_cost, qb_sync_status, qb_last_synced_at, qb_customer_id')
      .eq('id', id)
      .single(),
    admin
      .from('budget_lines')
      .select('*')
      .eq('job_id', id)
      .order('phase', { nullsFirst: false })
      .order('cost_code'),
    admin
      .from('actuals')
      .select('*')
      .eq('job_id', id)
      .order('incurred_date', { ascending: false }),
    admin
      .from('change_orders')
      .select('*')
      .eq('job_id', id)
      .order('co_number'),
  ])

  if (!job) notFound()

  return (
    <BudgetClient
      jobId={id}
      job={job}
      leadId={job.lead_id ?? undefined}
      initialLines={lines ?? []}
      initialActuals={actuals ?? []}
      initialChangeOrders={changeOrders ?? []}
      permissions={{
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
      }}
      currentUserId={user.id}
    />
  )
}
