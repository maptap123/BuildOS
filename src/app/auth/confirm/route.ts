import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/confirm — lands every emailed auth link (invite, password reset).
 *
 * Verifying server-side is what keeps the token out of the URL fragment. The
 * default Supabase link hands the session back as `#access_token=...`, which the
 * server can never read; with `token_hash` we call verifyOtp here, set the
 * session cookie, and forward the browser on with nothing secret in the URL.
 *
 * This route must stay public in the proxy — the whole point is that the
 * visitor has no session yet.
 */

/**
 * Only a bare same-origin path may be forwarded to, so `next` can't be bent into
 * an open redirect. Any query or fragment is dropped — `pathname` would escape
 * a `?` rather than honour it, producing a 404 instead of a redirect.
 */
function safeNext(raw: string | null): string {
  if (!raw) return '/welcome'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/welcome'
  const path = raw.split(/[?#]/)[0]
  return path || '/welcome'
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  const redirectTo = request.nextUrl.clone()
  redirectTo.search = ''

  // Supabase itself can report a failure before we ever see a token — an
  // already-used invite link arrives here as ?error=access_denied.
  const upstreamError = searchParams.get('error_description') ?? searchParams.get('error')

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }
    redirectTo.pathname = '/welcome'
    redirectTo.searchParams.set('error', error.message)
    return NextResponse.redirect(redirectTo)
  }

  // PKCE links (?code=) — what Supabase sends when its own template is left on
  // the default and the project is configured for the code flow.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }
    redirectTo.pathname = '/welcome'
    redirectTo.searchParams.set('error', error.message)
    return NextResponse.redirect(redirectTo)
  }

  redirectTo.pathname = '/welcome'
  redirectTo.searchParams.set(
    'error',
    upstreamError ?? 'This link is missing its sign-in token.'
  )
  return NextResponse.redirect(redirectTo)
}
