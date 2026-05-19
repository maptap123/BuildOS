import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
// TODO (Phase 4): import { QuickBooksClient } from '@/lib/quickbooks/client'
// TODO (Phase 4): import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/integrations/quickbooks/callback?code=...&realmId=...&state=...
 *
 * Handles the OAuth 2.0 redirect from Intuit after the user grants access.
 *
 * Phase 4 implementation plan:
 *   1. Validate `state` against stored session value (CSRF protection)
 *   2. Call QuickBooksClient.handleCallback(code, realmId)
 *   3. Encrypt and store tokens in quickbooks_tokens table
 *   4. Update integration_settings: is_connected=true, realm_id, connected_at
 *   5. Redirect to /admin/integrations with success message
 *
 * Required env vars (not yet set):
 *   QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI, QB_TOKEN_ENCRYPTION_KEY
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const code    = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state   = searchParams.get('state')

  // Log the incoming params for future debugging — remove when implementing
  console.log('[QB callback stub] code:', !!code, 'realmId:', realmId, 'state:', state)

  // TODO (Phase 4): validate state, exchange code for tokens, store encrypted tokens
  return NextResponse.json(
    {
      error: 'QuickBooks OAuth callback not yet implemented',
      note: 'Phase 4: Implement token exchange, encryption, and storage in quickbooks_tokens table.',
      received: { code: !!code, realmId, state },
    },
    { status: 501 }
  )
}
