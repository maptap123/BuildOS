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
 * POST /api/admin/users/invite — create an account and email the invitation.
 *
 * Found broken 2026-09-01: this route called inviteUserByEmail with no
 * redirectTo, so Supabase fell back to the project's Site URL — still
 * http://localhost:3000 — and every invitee got an "Accept invitation" button
 * pointing at their own phone. The mail also arrived as "Supabase Auth", from
 * a mailer capped at two messages an hour.
 *
 * So BuildOS now owns the invitation: Supabase mints the token via
 * generateLink, we build the accept URL against our own domain and send a
 * JDC-branded email. Without RESEND_API_KEY there is nothing to send with, so
 * we fall back to Supabase's mailer — but with an explicit redirectTo, which is
 * the part that was actually broken.
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

  // Who is doing the inviting — used in the email so it doesn't read as spam.
  const { data: inviter } = await admin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (isEmailConfigured()) {
    // Mint a token without sending Supabase's email, then send our own.
    let generated = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: { full_name: fullName || null }, redirectTo: confirmUrl },
    })

    // Re-inviting someone who never finished signing up is the common case —
    // the account already exists from the first attempt. A recovery link puts
    // them through the same set-a-password screen.
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

    if (fullName && linkType === 'recovery') {
      await admin.auth.admin.updateUserById(invitedUser.id, {
        user_metadata: { ...invitedUser.user_metadata, full_name: fullName },
      })
    }

    await upsertProfile(admin, invitedUser.id, invitedUser.email ?? email, fullName)

    const acceptUrl =
      `${confirmUrl}?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=${linkType}&next=${encodeURIComponent('/welcome')}`

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
      // The account exists and the link is valid — losing it to a delivery
      // failure would mean an orphaned account nobody can reach, so hand the
      // link back for the admin to pass along.
      return NextResponse.json(
        {
          error: `The account was created but the email failed to send (${sent.error}). Send this link to ${email} yourself.`,
          id: invitedUser.id,
          email: invitedUser.email,
          accept_url: acceptUrl,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      id: invitedUser.id,
      email: invitedUser.email,
      sent_via: 'buildos',
    })
  }

  // No mail provider configured yet — Supabase sends it, but at least the
  // button now points at BuildOS instead of the invitee's own localhost.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || null },
    redirectTo: confirmUrl,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await upsertProfile(admin, data.user.id, data.user.email ?? email, fullName)

  return NextResponse.json({ id: data.user.id, email: data.user.email, sent_via: 'supabase' })
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
