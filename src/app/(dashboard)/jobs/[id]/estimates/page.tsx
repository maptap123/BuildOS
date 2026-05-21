import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ImportEstimateButton } from '@/components/budget/ImportEstimateButton'
import type { Estimate, EstimateLine } from '@/types'

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  voided:   'bg-gray-100 text-gray-400',
}

function lineTotal(line: EstimateLine): number {
  return Number(line.quantity) * Number(line.unit_cost)
}

export default async function JobEstimatesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: perm }, { data: budgetPerm }, { data: job }] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_create').eq('user_id', user.id).eq('module', 'budget').single(),
    admin.from('user_permissions').select('can_create').eq('user_id', user.id).eq('module', 'budget').single(),
    admin.from('jobs').select('id, lead_id, name').eq('id', id).single(),
  ])

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view estimates.
      </div>
    )
  }

  if (!job) notFound()

  if (!job.lead_id) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center space-y-2">
        <FileText size={32} className="mx-auto text-gray-300" />
        <p className="text-sm font-medium text-navy-800">No linked lead</p>
        <p className="text-xs text-gray-400">Estimates are created from leads. This job has no linked lead.</p>
      </div>
    )
  }

  // Load estimates for this lead
  const { data: estimates } = await admin
    .from('estimates')
    .select('*')
    .eq('lead_id', job.lead_id)
    .order('version', { ascending: false })

  // Load line counts + totals per estimate
  const estimateIds = (estimates ?? []).map((e: Estimate) => e.id)
  const { data: allLines } = estimateIds.length > 0
    ? await admin.from('estimate_lines').select('estimate_id, quantity, unit_cost').in('estimate_id', estimateIds)
    : { data: [] }

  const linesByEstimate = new Map<string, EstimateLine[]>()
  for (const line of (allLines ?? []) as EstimateLine[]) {
    const arr = linesByEstimate.get(line.estimate_id) ?? []
    arr.push(line)
    linesByEstimate.set(line.estimate_id, arr)
  }

  const estimateList = (estimates ?? []) as Estimate[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-navy-900 text-base">Estimates</h3>
          <p className="text-xs text-gray-400 mt-0.5">From linked lead</p>
        </div>
        <Link
          href={`/leads/${job.lead_id}/estimate`}
          className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium"
        >
          Open in Estimate Builder
          <ArrowRight size={13} />
        </Link>
      </div>

      {estimateList.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center space-y-2">
          <FileText size={32} className="mx-auto text-gray-300" />
          <p className="text-sm font-medium text-navy-800">No estimates yet</p>
          <p className="text-xs text-gray-400">
            <Link href={`/leads/${job.lead_id}/estimate`} className="text-gold-600 hover:underline">
              Create an estimate
            </Link>{' '}
            from the linked lead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {estimateList.map((estimate) => {
            const lines = linesByEstimate.get(estimate.id) ?? []
            const total = lines.reduce((s, l) => s + lineTotal(l), 0)
            const statusCls = STATUS_COLOR[estimate.status] ?? 'bg-gray-100 text-gray-600'

            return (
              <div
                key={estimate.id}
                className="bg-white rounded-xl border border-border p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-navy-900">
                      {estimate.title ?? `Estimate v${estimate.version}`}
                    </span>
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusCls}`}>
                      {estimate.status}
                    </span>
                    <span className="text-[11px] text-gray-400">v{estimate.version}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                    <span>{fmtCurrency(total)} cost</span>
                    {estimate.markup_pct > 0 && (
                      <span>+{estimate.markup_pct}% markup</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {budgetPerm?.can_create && lines.length > 0 && (
                    <ImportEstimateButton
                      jobId={id}
                      estimate={estimate}
                      lineCount={lines.length}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
