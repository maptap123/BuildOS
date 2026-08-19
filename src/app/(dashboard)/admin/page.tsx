import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUsersClient } from '@/components/admin/AdminUsersClient'
import { AdminTagsClient } from '@/components/admin/AdminTagsClient'
import type { User, UserPermission } from '@/types'
import type { TagOption } from '@/hooks/useTagOptions'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ qb?: string; qb_message?: string }>
}) {
  const { qb, qb_message: qbMessage } = await searchParams
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

  const [{ data: users }, { data: permissions }, { data: tagOptions }, { data: qbSettings }] = await Promise.all([
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
    admin
      .from('integration_settings')
      .select('is_connected, realm_id, connected_at')
      .eq('service', 'quickbooks')
      .single(),
  ])

  return (
    <div className="space-y-8">
      {qb && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            qb === 'connected'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {qb === 'connected'
            ? 'QuickBooks connected successfully.'
            : `QuickBooks connection failed${qbMessage ? `: ${qbMessage}` : '.'}`}
        </div>
      )}

      <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-navy-900 text-sm">QuickBooks</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {qbSettings?.is_connected
              ? `Connected (company ${qbSettings.realm_id}) since ${qbSettings.connected_at ? new Date(qbSettings.connected_at).toLocaleDateString() : 'unknown'}`
              : `Not connected (${process.env.QB_ENVIRONMENT ?? 'sandbox'} environment)`}
          </p>
        </div>
        <a
          href="/api/integrations/quickbooks/connect"
          className="text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 px-4 py-2 rounded-lg transition-colors"
        >
          {qbSettings?.is_connected ? 'Reconnect' : 'Connect'}
        </a>
      </div>

      <AdminUsersClient
        currentUserId={user.id}
        initialUsers={(users ?? []) as User[]}
        initialPermissions={(permissions ?? []) as UserPermission[]}
      />
      <AdminTagsClient initialTags={(tagOptions ?? []) as TagOption[]} />
    </div>
  )
}
