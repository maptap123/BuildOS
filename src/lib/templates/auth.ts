import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'

/**
 * Templates have no module of their own: viewing needs `jobs.can_view`, changing them needs
 * `jobs.can_edit` (admins bypass both). Returns either the caller or a ready-to-return error response.
 */
export async function authorizeTemplates(
  action: 'view' | 'edit',
): Promise<{ userId: string; admin: ReturnType<typeof createAdminClient> } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const ok = await hasModulePermOrAdmin(admin, user.id, 'jobs', action === 'view' ? 'can_view' : 'can_edit')
  if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: user.id, admin }
}
