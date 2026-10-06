import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LeadDetailClient } from '@/components/leads'
import { leadProposalTotals } from '@/lib/estimates/leadProposalTotals'
import type { Lead, LeadActivity } from '@/types'

export const metadata = { title: 'Lead Detail — BuildOS' }

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: leadPerm }, { data: jobPerm }, { data: adminPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'leads').single(),
    admin.from('user_permissions').select('can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'jobs').single(),
    admin.from('user_permissions').select('can_manage').eq('user_id', user.id).eq('module', 'admin').single(),
  ])

  // Same rule as the API (hasModulePermOrAdmin): admins can do everything.
  const isAdmin = Boolean(adminPerm?.can_manage)
  const perm = leadPerm ?? jobPerm

  if (!isAdmin && !leadPerm?.can_view && !jobPerm?.can_create && !jobPerm?.can_edit) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view leads.
      </div>
    )
  }

  const [{ data: lead, error: leadErr }, { data: activities }, { data: users }, { count: estimateCount }] = await Promise.all([
    admin.from('leads').select('*').eq('id', id).single(),
    admin
      .from('lead_activities')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: true }),
    admin.from('users').select('id, full_name, email').eq('is_active', true).order('full_name'),
    admin.from('estimates').select('id', { count: 'exact', head: true }).eq('lead_id', id),
  ])

  if (leadErr || !lead) notFound()

  const proposalTotals = await leadProposalTotals(admin, [lead.id])

  return (
    <LeadDetailClient
      lead={{ ...lead, proposal_total: proposalTotals.get(lead.id) ?? null } as Lead}
      initialActivities={(activities ?? []) as LeadActivity[]}
      users={(users ?? []).map(u => ({ id: u.id, name: u.full_name || u.email }))}
      currentUserId={user.id}
      estimateCount={estimateCount ?? 0}
      permissions={{
        can_create: isAdmin || (perm?.can_create ?? false),
        can_edit:   isAdmin || (perm?.can_edit ?? false),
        can_delete: isAdmin || (perm?.can_delete ?? false),
      }}
    />
  )
}
