import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LeadDetailClient } from '@/components/leads'
import type { Lead, LeadActivity } from '@/types'

export const metadata = { title: 'Lead Detail — JDC Platform' }

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

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view leads.
      </div>
    )
  }

  const [{ data: lead, error: leadErr }, { data: activities }] = await Promise.all([
    admin.from('leads').select('*').eq('id', id).single(),
    admin
      .from('lead_activities')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (leadErr || !lead) notFound()

  return (
    <LeadDetailClient
      lead={lead as Lead}
      initialActivities={(activities ?? []) as LeadActivity[]}
      permissions={{
        can_create: perm.can_create,
        can_edit:   perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
