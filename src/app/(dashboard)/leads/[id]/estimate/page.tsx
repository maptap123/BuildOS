import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EstimateBuilderClient } from '@/components/estimates'
import { resolveDeletePermission } from '@/lib/estimates/deleteGuard'
import type { Lead, Estimate, EstimateLine } from '@/types'

export const metadata = { title: 'Estimate Builder — BuildOS' }

export default async function LeadEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // maybeSingle() distinguishes absent rows (null, no error) from DB errors,
  // which is critical for resolveDeletePermission (row-present governs).
  const [
    { data: estimatePerm },
    { data: budgetPerm },
    { data: lead, error: leadErr },
  ] = await Promise.all([
    admin
      .from('user_permissions')
      .select('can_view, can_create, can_edit, can_delete')
      .eq('user_id', user.id)
      .eq('module', 'estimates')
      .maybeSingle(),
    admin
      .from('user_permissions')
      .select('can_view, can_create, can_edit, can_delete')
      .eq('user_id', user.id)
      .eq('module', 'budget')
      .maybeSingle(),
    admin.from('leads').select('*').eq('id', id).single(),
  ])

  // For non-delete ops: prefer estimates module if enrolled, else fall back to budget
  const perm = estimatePerm?.can_view ? estimatePerm : budgetPerm

  if (!estimatePerm?.can_view && !budgetPerm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view estimates.
      </div>
    )
  }

  if (leadErr || !lead) notFound()

  // For delete: estimates row present governs exclusively; absent → budget fallback.
  // Both paths require can_view AND can_delete.
  const canDelete = resolveDeletePermission(
    estimatePerm ? { can_view: estimatePerm.can_view, can_delete: estimatePerm.can_delete } : null,
    budgetPerm   ? { can_view: budgetPerm.can_view,   can_delete: budgetPerm.can_delete   } : null,
  )

  // Load existing estimates for this lead
  const { data: estimates } = await admin
    .from('estimates')
    .select('*')
    .eq('lead_id', id)
    .order('version', { ascending: false })

  // Load lines for the most recent estimate (if any)
  const latestEstimate = estimates?.[0] ?? null
  const { data: lines } = latestEstimate
    ? await admin
        .from('estimate_lines')
        .select('*')
        .eq('estimate_id', latestEstimate.id)
        .order('sort_order')
        .order('created_at')
    : { data: [] }

  return (
    <EstimateBuilderClient
      lead={lead as Lead}
      initialEstimates={(estimates ?? []) as Estimate[]}
      initialLines={(lines ?? []) as EstimateLine[]}
      permissions={{
        can_create: perm?.can_create ?? false,
        can_edit:   perm?.can_edit ?? false,
        can_delete: canDelete,
      }}
    />
  )
}
