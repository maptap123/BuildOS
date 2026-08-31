import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildConfirmedMessage,
  buildDeclinedMessage,
  formatDateRange,
  googleCalendarUrl,
  jobAddress,
  loadAssignmentByToken,
  recordResponse,
  sendAssignmentSms,
} from '@/lib/schedule/assignments'
import { NextResponse } from 'next/server'

// Public route — authenticated by schedule_assignments.token, no session required.
// This is the link Fixer texts the sub, so it must work on a phone with no login.

type Params = { params: Promise<{ token: string }> }

/** GET /api/appt/[token] — everything the confirmation page shows. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const ctx = await loadAssignmentByToken(admin, token)
  if (!ctx) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  return NextResponse.json({
    contact_name: ctx.assignment.contact_name,
    status: ctx.assignment.status,
    responded_at: ctx.assignment.responded_at,
    title: ctx.item.title,
    description: ctx.item.description,
    trade: ctx.item.trade,
    start_date: ctx.item.start_date,
    end_date: ctx.item.end_date,
    date_label: formatDateRange(ctx.item.start_date, ctx.item.end_date),
    job_name: ctx.job.name,
    job_number: ctx.job.job_number,
    address: jobAddress(ctx.job),
    ics_url: `/api/appt/${token}/ics`,
    google_calendar_url: googleCalendarUrl(ctx),
  })
}

/**
 * POST /api/appt/[token] — confirm or decline from the web link instead of by text.
 * Body: { action: 'confirm' | 'decline', note?: string }
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params
  const body = await request.json().catch(() => ({})) as { action?: string; note?: string }

  if (body.action !== 'confirm' && body.action !== 'decline') {
    return NextResponse.json({ error: 'action must be confirm or decline' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ctx = await loadAssignmentByToken(admin, token)
  if (!ctx) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  if (ctx.assignment.status === 'cancelled') {
    return NextResponse.json({ error: 'This appointment is no longer scheduled.' }, { status: 409 })
  }

  const answer = body.action === 'confirm' ? 'confirmed' : 'declined'
  const updated = await recordResponse(admin, ctx, answer, {
    note: body.note?.trim() || null,
    source: 'web',
  })

  // Mirror the web answer back over text so the sub's thread shows the same
  // outcome their phone's messaging app does.
  if (updated.assignment.phone) {
    await sendAssignmentSms(
      admin,
      updated,
      answer === 'confirmed' ? buildConfirmedMessage(updated) : buildDeclinedMessage(updated)
    )
  }

  return NextResponse.json({ ok: true, status: updated.assignment.status })
}
