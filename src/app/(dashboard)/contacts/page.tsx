import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ContactsClient } from '@/components/contacts'
import type { Contact } from '@/types'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: contactPerm }, { data: jobPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'contacts').single(),
    admin.from('user_permissions').select('can_create, can_edit, can_delete').eq('user_id', user.id).eq('module', 'jobs').single(),
  ])

  const perm = contactPerm ?? jobPerm

  if (!contactPerm?.can_view && !jobPerm?.can_create && !jobPerm?.can_edit) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view contacts.
      </div>
    )
  }

  const { data: contacts } = await admin
    .from('contacts')
    .select('*, jobs(name)')
    .order('full_name', { ascending: true })

  return (
    <ContactsClient
      initialContacts={(contacts ?? []) as Contact[]}
      permissions={{
        can_create: perm?.can_create ?? false,
        can_edit:   perm?.can_edit ?? false,
        can_delete: perm?.can_delete ?? false,
      }}
    />
  )
}
