import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUsersClient } from '@/components/admin/AdminUsersClient'
import { AdminTagsClient } from '@/components/admin/AdminTagsClient'
import type { User, UserPermission } from '@/types'
import type { TagOption } from '@/hooks/useTagOptions'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_manage) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to manage users.
      </div>
    )
  }

  const [{ data: users }, { data: permissions }, { data: tagOptions }] = await Promise.all([
    admin
      .from('users')
      .select('*')
      .order('full_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true }),
    admin
      .from('user_permissions')
      .select('*')
      .order('module', { ascending: true }),
    admin
      .from('job_tag_options')
      .select('id, name, sort_order')
      .order('sort_order')
      .order('name'),
  ])

  return (
    <div className="space-y-8">
      <AdminUsersClient
        currentUserId={user.id}
        initialUsers={(users ?? []) as User[]}
        initialPermissions={(permissions ?? []) as UserPermission[]}
      />
      <AdminTagsClient initialTags={(tagOptions ?? []) as TagOption[]} />
    </div>
  )
}
