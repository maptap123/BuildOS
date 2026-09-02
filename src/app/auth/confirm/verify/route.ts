import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /auth/confirm/verify — spends the one-time token and starts the session.
 *
 * POST-only by design. Supabase tokens are single-use and link previewers,
 * mail scanners and chat unfurlers all issue GETs, so a token reachable by GET
 * gets spent before the person it was sent to ever opens it. They do not submit
 * forms, so the redemption lives behind the Continue button on /auth/confirm.
 *
 * Verifying here rather than in the browser also keeps the token out of the URL
 * fragment: the session cookie is set on this response and the browser is
 * forwarded on with nothing secret in the address bar.
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

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const tokenHash = (form.get('token_hash') as string | null) ?? null
  const type = (form.get('type') as string | null) as EmailOtpType | null
  const code = (form.get('code') as string | null) ?? null
  const next = safeNext((form.get('next') as string | null) ?? null)

  const destination = request.nextUrl.clone()
  destination.search = ''

  const fail = (message: string) => {
    destination.pathname = '/welcome'
    destination.searchParams.set('error', message)
    // 303 so the browser follows with GET rather than re-POSTing.
    return NextResponse.redirect(destination, 303)
  }

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return fail(error.message)
    destination.pathname = next
    return NextResponse.redirect(destination, 303)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return fail(error.message)
    destination.pathname = next
    return NextResponse.redirect(destination, 303)
  }

  return fail('This link is missing its sign-in token.')
}
