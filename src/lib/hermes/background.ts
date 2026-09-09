import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const PUBLIC_REQUEST_FIELDS = 'id,estimate_id,message,status,progress,result,error,created_at,started_at,finished_at'
export const BACKGROUND_TOOLS = new Set(['find_comparable_estimates', 'find_line_pricing', 'add_estimate_lines'])
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Budget access is company-wide in BuildOS. Conversations additionally belong to
// the requesting user and estimate; callers never supply a conversation owner.
export async function backgroundGuard() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  if (!await canUseBackground(admin, user.id)) {
    return { response: Response.json({ error: 'AI and budget access required' }, { status: 403 }) }
  }
  return { admin, user }
}

export async function canUseBackground(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: user }, { data: perms, error }] = await Promise.all([
    admin.from('users').select('is_active').eq('id', userId).single(),
    admin.from('user_permissions').select('module,can_view,can_create').eq('user_id', userId).in('module', ['ai', 'budget']),
  ])
  return !error && !!user?.is_active && !!perms?.some(p => p.module === 'ai' && p.can_view)
    && !!perms?.some(p => p.module === 'budget' && p.can_view && p.can_create)
}
