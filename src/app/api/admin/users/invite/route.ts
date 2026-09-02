import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/appUrl'
import { isEmailConfigured, sendEmail } from '@/lib/email/client'
import {
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
} from '@/lib/email/templates/invite'

/**
 * POST /api/admin/users/invite — create an account and hand over the invitation.
 *
 * Found broken 2026-09-01: this route called inviteUserByEmail with no
 * redirectTo, so Supabase fell back to the project's Site URL — still
 * http://localhost:3000 — and every invitee got an "Accept invitation" button
 * pointing at their own phone. The mail also arrived as "Supabase Auth".
 *
 * So BuildOS mints the token itself with generateLink and builds the accept URL
 * against our own domain. Deliberately not inviteUserByEmail even as a fallback:
 * that path re-reads the Site URL and silently ignores a redirectTo that isn't
 * in the project's allow-list, which is exactly how the original bug shipped.
 * generateLink reads neither setting, so an invite cannot point at localhost
 * again no matter what the dashboard says.
 *
 * With RESEND_API_KEY set we send a JDC-branded email. Without it the account
 * and link still get created and come back for the admin to pass along by hand.
 */

/** Supabase's default invite/recovery token lifetime. Mirrored in the email copy. */
const LINK_TTL = '24 hours'

function alreadyRegistered(error: { code?: string; message?: string }): boolean {
  if (error.code === 'email_exists') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('already been registered') || message.includes('already registered')
}

export async function POST(request: Request) {
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

  if (!adminPerm?.can_manage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const base = appUrl()
  if (!base) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL is not set, so the invite link would point nowhere. Set it and try again.' },
      { status: 500 }
    )
  }
  const confirmUrl = `${base}/auth/confirm`

  // Mint a token without sending anything.
  let generated = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { full_name: fullName || null }, redirectTo: confirmUrl },
  })

  // Re-inviting someone who never finished signing up is the common case — the
  // account already exists from the first attempt. A recovery link puts them
  // through the same set-a-password screen, keeping the permissions already
  // granted to that account.
  let linkType = 'invite'
  if (generated.error && alreadyRegistered(generated.error)) {
    linkType = 'recovery'
    generated = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: confirmUrl },
    })
  }

  if (generated.error || !generated.data?.user) {
    return NextResponse.json(
      { error: generated.error?.message ?? 'Could not create the invitation' },
      { status: 400 }
    )
  }

  const invitedUser = generated.data.user
  const tokenHash = generated.data.properties?.hashed_token

  if (!tokenHash) {
    return NextResponse.json({ error: 'Supabase did not return an invite token' }, { status: 502 })
  }

  // Re-inviting someone who was removed has to lift the removal, or the link
  // we just minted can never be redeemed: the ban is checked when the token is
  // verified, not when it is generated, so the invite looks like it sent fine
  // and then dies on their phone as "user is banned". Inviting someone *is* the
  // act of granting access, so treat it as one.
  let reactivated = false
  if (linkType === 'recovery') {
    const { data: existing } = await admin
      .from('users')
      .select('is_active')
      .eq('id', invitedUser.id)
      .maybeSingle()

    const wasBanned = Boolean(invitedUser.banned_until)
    reactivated = wasBanned || existing?.is_active === false

    if (reactivated) {
      await admin.auth.admin.updateUserById(invitedUser.id, { ban_duration: 'none' })
      await admin.from('users').update({ is_active: true }).eq('id', invitedUser.id)
    }

    if (fullName) {
      await admin.auth.admin.updateUserById(invitedUser.id, {
        user_metadata: { ...invitedUser.user_metadata, full_name: fullName },
      })
    }
  }

  await upsertProfile(admin, invitedUser.id, invitedUser.email ?? email, fullName)

  const acceptUrl =
    `${confirmUrl}?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=${linkType}&next=${encodeURIComponent('/welcome')}`

  const result = {
    id: invitedUser.id,
    email: invitedUser.email,
    accept_url: acceptUrl,
    expires_in: LINK_TTL,
    reactivated,
  }

  // No mail provider yet — the account and link are real, so hand them back
  // rather than creating someone nobody can reach.
  if (!isEmailConfigured()) {
    return NextResponse.json({ ...result, sent_via: 'manual' })
  }

  // Who is doing the inviting — named in the email so it doesn't read as spam.
  const { data: inviter } = await admin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const emailInput = {
    fullName: fullName || null,
    invitedBy: inviter?.full_name ?? null,
    acceptUrl,
    expiresIn: LINK_TTL,
  }

  const sent = await sendEmail({
    to: email,
    subject: inviteEmailSubject(),
    html: inviteEmailHtml(emailInput),
    text: inviteEmailText(emailInput),
  })

  if (!sent.ok) {
    return NextResponse.json({
      ...result,
      sent_via: 'manual',
      send_error: sent.error ?? 'The email failed to send',
    })
  }

  return NextResponse.json({ ...result, sent_via: 'email' })
}

/** The auth trigger may not fire for invited users until they accept, so seed the row now. */
async function upsertProfile(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  email: string,
  fullName: string
) {
  await admin.from('users').upsert(
    {
      id,
      email,
      full_name: fullName || null,
      is_active: true,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )
}
