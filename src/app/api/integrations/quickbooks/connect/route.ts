import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUrl } from '@/lib/quickbooks/client'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

/**
 * GET /api/integrations/quickbooks/connect
 *
 * Starts the QuickBooks OAuth 2.0 flow: generates a CSRF `state` value, stores
 * it in a short-lived httpOnly cookie (verified by the callback), and redirects
 * to Intuit's authorization page. Admin-only — this grants BuildOS access to
 * the company's real QuickBooks data.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminPerm } = await createAdminClient()
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  if (!adminPerm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.QB_CLIENT_ID || !process.env.QB_CLIENT_SECRET || !process.env.QB_REDIRECT_URI) {
    return NextResponse.json(
      { error: 'QuickBooks is not configured. Set QB_CLIENT_ID, QB_CLIENT_SECRET, and QB_REDIRECT_URI.' },
      { status: 501 },
    )
  }

  const state = randomBytes(24).toString('hex')
  const response = NextResponse.redirect(getAuthUrl(state))
  response.cookies.set('qb_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
