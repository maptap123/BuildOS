import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProfitabilityClient } from '@/components/profitability'

export default async function JobProfitabilityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profitPerm }, { data: budgetPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'profitability').single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'budget').single(),
  ])

  if (!profitPerm?.can_view && !budgetPerm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view profitability data.
      </div>
    )
  }

  const [{ data: job }, linesResult, actualsResult, cosResult] = await Promise.all([
    admin
      .from('jobs')
      .select('id, name, contract_amount, estimated_cost, status')
      .eq('id', id)
      .single(),
    admin.from('budget_lines').select('*').eq('job_id', id),
    admin.from('actuals').select('*').eq('job_id', id),
    admin.from('change_orders').select('*').eq('job_id', id),
  ])

  if (!job) notFound()

  return (
    <ProfitabilityClient
      job={job}
      lines={linesResult.data ?? []}
      actuals={actualsResult.data ?? []}
      changeOrders={cosResult.data ?? []}
    />
  )
}
