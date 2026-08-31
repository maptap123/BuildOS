import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import {
  buildConfirmedMessage,
  buildInviteMessage,
  formatDateRange,
  loadAssignmentById,
  recordResponse,
  sendAssignmentSms,
} from '@/lib/schedule/assignments'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string; assignmentId: string }> }

type Action = 'remind' | 'confirm' | 'decline' | 'send_calendar'

/**
 * POST /api/schedule/[id]/assignments/[assignmentId]
 * Body: { action, note? }
 *
 * Office-side controls for one invite: re-send it, resend the calendar link, or
 * record an answer the sub gave over the phone instead of by text.
 */
export async function POST(request: Request, { params }: Params) {
  const { assignmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await hasModulePermOrAdmin(admin, user.id, 'schedule', 'can_edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { action?: Action; note?: string }
  const action = body.action
  if (!action || !['remind', 'confirm', 'decline', 'send_calendar'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be remind, confirm, decline, or send_calendar' },
      { status: 400 }
    )
  }

  const ctx = await loadAssignmentById(admin, assignmentId)
  if (!ctx) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  if (action === 'remind') {
    const sms = await sendAssignmentSms(admin, ctx, buildInviteMessage(ctx, true), {
      markSent: true,
      incrementReminder: true,
    })
    if (!sms.ok) return NextResponse.json({ error: sms.error }, { status: 502 })
    return NextResponse.json({ ok: true, message: `Reminder texted to ${ctx.assignment.contact_name}` })
  }

  if (action === 'send_calendar') {
    const sms = await sendAssignmentSms(admin, ctx, buildConfirmedMessage(ctx))
    if (!sms.ok) return NextResponse.json({ error: sms.error }, { status: 502 })
    return NextResponse.json({ ok: true, message: 'Calendar link texted' })
  }

  const answer = action === 'confirm' ? 'confirmed' : 'declined'
  const updated = await recordResponse(admin, ctx, answer, {
    note: body.note?.trim() || `Recorded by ${user.email ?? 'office'}`,
    source: 'web',
  })

  return NextResponse.json({ ok: true, assignment: updated.assignment })
}

/**
 * DELETE /api/schedule/[id]/assignments/[assignmentId]?notify=true
 * Takes someone off the phase. With notify=true, texts them that it is off.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { assignmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await hasModulePermOrAdmin(admin, user.id, 'schedule', 'can_edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ctx = await loadAssignmentById(admin, assignmentId)
  if (!ctx) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const shouldNotify = new URL(request.url).searchParams.get('notify') === 'true'
  const wasInvited = ctx.assignment.status !== 'pending'

  await admin
    .from('schedule_assignments')
    .update({ status: 'cancelled', needs_attention: false })
    .eq('id', assignmentId)

  if (shouldNotify && wasInvited && ctx.assignment.phone) {
    const dates = formatDateRange(ctx.item.start_date, ctx.item.end_date)
    await sendAssignmentSms(
      admin,
      ctx,
      `Update from JDC Construction: ${ctx.item.title} on ${dates} is off your schedule. No action needed — we'll be in touch if that changes.`
    )
  }

  return NextResponse.json({ ok: true })
}
