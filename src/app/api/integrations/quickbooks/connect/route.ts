import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
// TODO (Phase 4): import { QuickBooksClient } from '@/lib/quickbooks/client'

/**
 * GET /api/integrations/quickbooks/connect
 *
 * Initiates the QuickBooks OAuth 2.0 flow by redirecting the user to Intuit's
 * authorization endpoint.
 *
 * Phase 4: When QB_CLIENT_ID and QB_CLIENT_SECRET are configured:
 *   1. Generate a random `state` parameter and store in session/cookie
 *   2. Call QuickBooksClient.getAuthUrl(state)
 *   3. return redirect(authUrl)
 *
 * Required env vars (not yet set):
 *   QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI, QB_ENVIRONMENT
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // TODO (Phase 4): check admin permission before initiating OAuth
  // const { data: adminPerm } = await createAdminClient()
  //   .from('user_permissions').select('can_manage').eq('user_id', user.id).eq('module', 'admin').single()
  // if (!adminPerm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // TODO (Phase 4): replace with redirect(QuickBooksClient.getAuthUrl(state))
  return NextResponse.json(
    {
      error: 'QuickBooks OAuth not yet configured',
      note: 'Phase 4: Set QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI, and QB_ENVIRONMENT env vars, then implement QuickBooksClient.getAuthUrl().',
    },
    { status: 501 }
  )
}
