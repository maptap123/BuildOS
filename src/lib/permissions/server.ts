import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>
type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete' | 'can_export' | 'can_manage'

// Server-side permission check used by API route handlers: true if the user has the
// given flag on `module`, OR is an admin (admin.can_manage) — admins always bypass
// per-module gates, matching the client-side usePermissions()'s isAdmin()||can(...) convention.
export async function hasModulePermOrAdmin(
  admin: AdminClient,
  userId: string,
  module: string,
  action: PermissionAction,
): Promise<boolean> {
  const [{ data: perm }, { data: adminPerm }] = await Promise.all([
    admin.from('user_permissions').select(action).eq('user_id', userId).eq('module', module).single(),
    admin.from('user_permissions').select('can_manage').eq('user_id', userId).eq('module', 'admin').single(),
  ])
  return Boolean((perm as Record<string, boolean> | null)?.[action]) || Boolean(adminPerm?.can_manage)
}
