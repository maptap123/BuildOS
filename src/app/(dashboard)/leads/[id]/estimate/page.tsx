import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EstimateBuilderClient } from '@/components/estimates'
import type { Lead, Estimate, EstimateLine } from '@/types'

export const metadata = { title: 'Estimate Builder — JDC Platform' }

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

  const [{ data: perm }, { data: lead, error: leadErr }] = await Promise.all([
    admin
      .from('user_permissions')
      .select('can_view, can_create, can_edit, can_delete')
      .eq('user_id', user.id)
      .eq('module', 'budget')
      .single(),
    admin.from('leads').select('*').eq('id', id).single(),
  ])

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view estimates.
      </div>
    )
  }

  if (leadErr || !lead) notFound()

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
        can_create: perm.can_create,
        can_edit:   perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
