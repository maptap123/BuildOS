import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LeadDetailClient } from '@/components/leads'
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

  const [{ data: leadPerm }, { data: jobPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'leads').single(),
    admin.from('user_permissions').select('can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'jobs').single(),
  ])

  const perm = leadPerm ?? jobPerm

  if (!leadPerm?.can_view && !jobPerm?.can_create && !jobPerm?.can_edit) {
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
        can_create: perm?.can_create ?? false,
        can_edit:   perm?.can_edit ?? false,
        can_delete: perm?.can_delete ?? false,
      }}
    />
  )
}
