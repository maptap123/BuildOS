import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'

type Action = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

/**
 * Selections has its own permission module (View / Create / Edit). Edit also covers
 * delete, so can_delete is checked against can_edit's mirrored flag.
 * Returns the user + service-role client, or the response to send back.
 */
export async function requireSelectionsPerm(
  action: Action,
): Promise<{ user: User; admin: SupabaseClient } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!(await hasModulePermOrAdmin(admin, user.id, 'selections', action))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user, admin }
}
