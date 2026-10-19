import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'

type Action = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

/**
 * Selections rides the Budget permission — allowances and overage change orders are
 * money, and the office users who manage selections already hold it.
 * Returns the user + service-role client, or the response to send back.
 */
export async function requireSelectionsPerm(
  action: Action,
): Promise<{ user: User; admin: SupabaseClient } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!(await hasModulePermOrAdmin(admin, user.id, 'budget', action))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user, admin }
}
