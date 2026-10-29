import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/appUrl'
import { isEmailConfigured, sendEmail } from '@/lib/email/client'
import {
  passwordResetEmailHtml,
  passwordResetEmailSubject,
  passwordResetEmailText,
} from '@/lib/email/templates/passwordReset'

/**
 * POST /api/auth/reset-password — emails a "pick a new password" link.
 *
 * Built like the invite route rather than calling resetPasswordForEmail from the
 * browser: that path builds the link from the project's Site URL (still
 * http://localhost:3000) and mails it as "Supabase Auth". Here generateLink mints
 * the token and the link points at our own /auth/confirm, so it gets the same
 * press-Continue protection from link previewers, then /welcome sets the password.
 *
 * Always answers ok, whether or not the email has an account, so the form can't
 * be used to find out who works at JDC. Removed accounts get nothing — unlike a
 * re-invite, a reset must not lift a ban.
 */

/** Supabase's email token lifetime — same setting the invite route mirrors. */
const LINK_TTL = '24 hours'

/** One reset email per account per minute, so the form can't be used to flood an inbox. */
const RESEND_COOLDOWN_MS = 60_000

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const ok = NextResponse.json({ ok: true })
  const base = appUrl()
  const confirmUrl = `${base}/auth/confirm`

  // No mail provider: let Supabase's mailer send it. Its link still needs our
  // /auth/confirm in the project's redirect allow-list to land in the right place.
  if (!isEmailConfigured()) {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${confirmUrl}?next=/welcome&flow=reset`,
    })
    if (error) console.error('[reset-password] supabase mailer failed:', error.message)
    return ok
  }

  if (!base) {
    console.error('[reset-password] NEXT_PUBLIC_APP_URL is unset — cannot build a reset link')
    return ok
  }

  const admin = createAdminClient()

  // auth.admin.listUsers 500s on this project, so find the account via public.users.
  const { data: profile } = await admin
    .from('users')
    .select('id, full_name, is_active')
    .eq('email', email)
    .maybeSingle()

  if (!profile || profile.is_active === false) return ok

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
  const account = authUser?.user
  if (!account || account.banned_until) return ok

  const lastSent = account.recovery_sent_at ? Date.parse(account.recovery_sent_at) : 0
  if (Date.now() - lastSent < RESEND_COOLDOWN_MS) return ok

  const generated = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: confirmUrl },
  })

  const tokenHash = generated.data?.properties?.hashed_token
  if (generated.error || !tokenHash) {
    console.error('[reset-password] generateLink failed:', generated.error?.message)
    return ok
  }

  const resetUrl =
    `${confirmUrl}?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=recovery&next=${encodeURIComponent('/welcome')}`

  const emailInput = { fullName: profile.full_name ?? null, resetUrl, expiresIn: LINK_TTL }
  const sent = await sendEmail({
    to: account.email ?? email,
    subject: passwordResetEmailSubject(),
    html: passwordResetEmailHtml(emailInput),
    text: passwordResetEmailText(emailInput),
  })

  if (!sent.ok) console.error('[reset-password] send failed:', sent.error)
  return ok
}
