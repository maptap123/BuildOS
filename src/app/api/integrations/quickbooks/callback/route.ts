import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens } from '@/lib/quickbooks/client'
import { NextResponse } from 'next/server'

const ORG_ID = 'jdc' // single-tenant app — one QuickBooks connection for the whole company

/**
 * GET /api/integrations/quickbooks/callback?code=...&realmId=...&state=...
 *
 * Handles the OAuth 2.0 redirect from Intuit after the user grants access:
 * validates `state` against the cookie set in /connect (CSRF check), exchanges
 * `code` for tokens, stores them, and marks the integration connected.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const cookieState = request.headers.get('cookie')?.match(/qb_oauth_state=([^;]+)/)?.[1]

  function redirectWithStatus(status: 'connected' | 'error', message?: string) {
    const url = new URL('/admin', request.url)
    url.searchParams.set('qb', status)
    if (message) url.searchParams.set('qb_message', message)
    const res = NextResponse.redirect(url)
    res.cookies.delete('qb_oauth_state')
    return res
  }

  if (oauthError) {
    return redirectWithStatus('error', `QuickBooks denied access: ${oauthError}`)
  }
  if (!code || !realmId || !state) {
    return redirectWithStatus('error', 'Missing code, realmId, or state from QuickBooks.')
  }
  if (!cookieState || cookieState !== state) {
    return redirectWithStatus('error', 'State mismatch — possible CSRF, or the link expired. Try connecting again.')
  }

  const admin = createAdminClient()

  try {
    const tokens = await exchangeCodeForTokens(code)

    // Replace any existing connection for this org — one active token row at a time.
    await admin.from('quickbooks_tokens').delete().eq('org_id', ORG_ID)
    const { error: insertErr } = await admin.from('quickbooks_tokens').insert({
      org_id: ORG_ID,
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    })
    if (insertErr) throw new Error(`Failed to store tokens: ${insertErr.message}`)

    await admin.from('integration_settings').update({
      is_connected: true,
      realm_id: realmId,
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      sync_error: null,
    }).eq('service', 'quickbooks')

    return redirectWithStatus('connected')
  } catch (err) {
    return redirectWithStatus('error', err instanceof Error ? err.message : 'Unknown error connecting to QuickBooks.')
  }
}
