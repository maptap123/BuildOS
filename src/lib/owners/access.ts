import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Owners View is its own permission module and is deliberately NOT implied by admin —
 * company-wide margin is for the owners, not everyone who can manage users.
 * Returns the signed-in user id, or null (not signed in) / false (no access).
 */
export async function ownersAccess(): Promise<string | null | false> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'owners')
    .maybeSingle()
  return data?.can_view ? user.id : false
}
