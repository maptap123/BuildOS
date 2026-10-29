import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const PRIVACY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function privacyWorkerAuthorized(request: Request) {
  const key = process.env.FIXER_PRIVACY_WORKER_KEY
  const value = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  return !!key && key.length >= 32 && ![process.env.FIXER_WORKER_KEY, process.env.HERMES_JDC_API_KEY, process.env.FIXER_PRIVACY_DISPATCH_KEY].includes(key) && Buffer.byteLength(key) === Buffer.byteLength(value)
    && timingSafeEqual(Buffer.from(key), Buffer.from(value))
}
export async function employeeGuard() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const [{ data: profile, error }, { data: permission, error: permissionError }] = await Promise.all([
    admin.from('users').select('is_active').eq('id', user.id).single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'ai').single(),
  ])
  if (error || permissionError || !profile?.is_active || !permission?.can_view) {
    return { response: Response.json({ error: 'Active user and AI access required' }, { status: 403 }) }
  }
  return { user, admin }
}
