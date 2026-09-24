import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/integrations/quickbooks — connection status.
 *
 * QuickBooks is the source of truth: BuildOS only reads from it (job costs via
 * /api/integrations/quickbooks/costs). There is deliberately no write path.
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await admin
    .from('integration_settings')
    .select('service, is_connected, realm_id, connected_at, last_sync_at, sync_error')
    .eq('service', 'quickbooks')
    .maybeSingle()

  // No row (or table briefly unavailable) → respond gracefully as "not connected"
  if (!data) {
    return NextResponse.json({
      service: 'quickbooks',
      is_connected: false,
      realm_id: null,
      connected_at: null,
      last_sync_at: null,
      sync_error: null,
    })
  }

  return NextResponse.json(data)
}
