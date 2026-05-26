import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LeadsClient } from '@/components/leads'
import type { Lead } from '@/types'

export const metadata = { title: 'Leads — BuildOS' }

export default async function LeadsPage() {
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

  const { data: leads } = await admin
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <LeadsClient
      initialLeads={(leads ?? []) as Lead[]}
      permissions={{
        can_create: perm.can_create,
        can_edit:   perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
