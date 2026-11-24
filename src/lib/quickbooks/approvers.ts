import type { SupabaseClient } from '@supabase/supabase-js'

/** True for an active user listed in qb_approvers. The database claim function re-checks this. */
export async function isQuickBooksApprover(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('qb_approvers').select('user_id, users!inner(is_active)').eq('user_id', userId).maybeSingle()
  const active = (data as { users?: { is_active?: boolean } | { is_active?: boolean }[] } | null)?.users
  const flag = Array.isArray(active) ? active[0]?.is_active : active?.is_active
  return !!data && flag === true
}
