import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/twilio/client'

/**
 * PATCH /api/admin/users/[id] — remove someone from BuildOS, or put them back.
 *
 * Removing is deliberately not a delete. Crew members are referenced all over
 * the history — daily logs, time entries, task assignments, change orders — and
 * dropping the row would blank out who did what on jobs that have already been
 * billed. So a removed user keeps their name on past work and simply loses
 * access.
 *
 * That takes two changes, and both matter. is_active is what the assignee
 * pickers and notification queries filter on, but nothing reads it at sign-in —
 * so on its own it would hide someone from the app while leaving them able to
 * log straight back in. The auth-level ban is what actually shuts the door.
 */

/** GoTrue takes a duration, not a flag. A century is the idiom for "indefinite". */
const FOREVER = '876000h'
const UNBAN = 'none'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active (true or false) is required' }, { status: 400 })
  }
  const isActive: boolean = body.is_active

  // Removing yourself would lock you out of the only screen that can undo it.
  if (id === user.id && !isActive) {
    return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 })
  }

  // Nor can the last admin go — that leaves nobody able to manage users at all.
  if (!isActive) {
    const { data: admins } = await admin
      .from('user_permissions')
      .select('user_id, users!inner(is_active)')
      .eq('module', 'admin')
      .eq('can_manage', true)
      .eq('users.is_active', true)

    const remaining = (admins ?? []).filter(row => row.user_id !== id)
    if (remaining.length === 0) {
      return NextResponse.json(
        { error: 'This is the last admin. Give someone else admin access before removing them.' },
        { status: 400 }
      )
    }
  }

  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: isActive ? UNBAN : FOREVER,
  })
  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 400 })
  }

  const { error: profileError } = await admin
    .from('users')
    .update({ is_active: isActive })
    .eq('id', id)

  if (profileError) {
    // Put the sign-in block back the way it was rather than leaving the two
    // halves disagreeing about whether this person has access.
    await admin.auth.admin.updateUserById(id, { ban_duration: isActive ? FOREVER : UNBAN })
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ id, is_active: isActive })
}

/**
 * PUT /api/admin/users/[id] — edit someone's name, phone, or email.
 *
 * Separate from PATCH because that one is about access and carries guards this
 * doesn't need. Kept apart so the last-admin and self-removal checks can't be
 * bypassed by sending profile fields alongside is_active.
 *
 * Email is the sign-in identity, so it lives in auth as well as the users row.
 * Writing only one of the two would leave someone unable to log in with the
 * address the app shows for them, so both change together or neither does.
 *
 * Phone matters more than it looks: it is how Fixer works out who is texting.
 * A number that matches nobody reaches the agent as an unidentified sender.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const body = await request.json().catch(() => ({}))
  const updates: { full_name?: string | null; phone?: string | null; email?: string } = {}

  if ('full_name' in body) {
    const name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    updates.full_name = name || null
  }

  if ('phone' in body) {
    const raw = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!raw) {
      updates.phone = null
    } else {
      const normalized = normalizePhone(raw)
      if (!normalized) {
        return NextResponse.json(
          { error: `"${raw}" is not a phone number we can text. Use 10 digits, e.g. 513 555 0142.` },
          { status: 400 }
        )
      }
      // Only live accounts can hold a number. Someone removed keeps their name on
      // past work but shouldn't reserve a phone — otherwise replacing a duplicate
      // account leaves its number permanently unusable by the person it belongs to.
      const { data: clash } = await admin
        .from('users')
        .select('id, full_name')
        .eq('phone', normalized)
        .eq('is_active', true)
        .neq('id', id)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: `${clash.full_name ?? 'Another user'} already has that number. Fixer identifies people by phone, so two accounts cannot share one.` },
          { status: 400 }
        )
      }

      // Take it off any removed account still holding it, so restoring that one
      // later cannot resurrect a duplicate.
      await admin
        .from('users')
        .update({ phone: null })
        .eq('phone', normalized)
        .eq('is_active', false)
        .neq('id', id)

      updates.phone = normalized
    }
  }

  let emailChange: string | null = null
  if ('email' in body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    const { data: existing } = await admin
      .from('users')
      .select('id, email')
      .eq('id', id)
      .single()
    if (existing && existing.email !== email) {
      const { data: taken } = await admin
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .maybeSingle()
      if (taken) {
        return NextResponse.json({ error: 'Another account already uses that email.' }, { status: 400 })
      }
      emailChange = email
      updates.email = email
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  // Auth first: if it refuses the address, nothing has changed yet.
  if (emailChange) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, { email: emailChange })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
  }

  const { data: saved, error: profileError } = await admin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, full_name, email, phone')
    .single()

  if (profileError) {
    if (emailChange) {
      // Put the sign-in address back rather than leaving auth and the users row
      // disagreeing about who this person is.
      const { data: prior } = await admin.from('users').select('email').eq('id', id).single()
      if (prior?.email) {
        await admin.auth.admin.updateUserById(id, { email: prior.email })
      }
    }
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json(saved)
}
