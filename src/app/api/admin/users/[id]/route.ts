import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
