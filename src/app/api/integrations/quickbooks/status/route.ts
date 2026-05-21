import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/integrations/quickbooks/status
 *
 * Returns whether QuickBooks is connected and when it was last synced.
 * Requires the user to be authenticated (any role).
 *
 * Response:
 *   { connected: boolean, last_sync_at: string | null, realm_id: string | null }
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Check for a stored token row — existence means connected
  const { data: tokenRow } = await admin
    .from('quickbooks_tokens')
    .select('realm_id, expires_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.json({ connected: false, last_sync_at: null, realm_id: null })
  }

  // Also pull last_sync_at from integration_settings if available
  const { data: settings } = await admin
    .from('integration_settings')
    .select('last_sync_at, sync_error')
    .eq('service', 'quickbooks')
    .maybeSingle()

  return NextResponse.json({
    connected: true,
    realm_id: tokenRow.realm_id,
    token_expires_at: tokenRow.expires_at,
    last_sync_at: settings?.last_sync_at ?? null,
    sync_error: settings?.sync_error ?? null,
  })
}
