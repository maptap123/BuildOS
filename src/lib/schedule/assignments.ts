import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getJobNotifyTargets } from '@/lib/notifications'
import { sendSms } from '@/lib/twilio/client'

type AdminClient = ReturnType<typeof createAdminClient>

export type AssignmentStatus = 'pending' | 'sent' | 'confirmed' | 'declined' | 'cancelled'
export type AssigneeType = 'vendor' | 'user' | 'contact'

export interface ScheduleAssignment {
  id: string
  schedule_item_id: string
  job_id: string
  assignee_type: AssigneeType
  vendor_id: string | null
  user_id: string | null
  contact_id: string | null
  contact_name: string
  phone: string | null
  status: AssignmentStatus
  token: string
  invited_at: string | null
  responded_at: string | null
  response_note: string | null
  reminder_count: number
  last_outbound_at: string | null
  last_inbound_at: string | null
  needs_attention: boolean
  created_at: string
}

export interface AssignmentContext {
  assignment: ScheduleAssignment
  item: {
    id: string
    title: string
    description: string | null
    start_date: string
    end_date: string
    type: string
    trade: string | null
    status: string
  }
  job: {
    id: string
    name: string
    job_number: string
    site_address: string
    city: string | null
    state: string | null
    postal_code: string | null
    client_name: string
  }
}

const ASSIGNMENT_SELECT = `
  id, schedule_item_id, job_id, assignee_type, vendor_id, user_id, contact_id,
  contact_name, phone, status, token, invited_at, responded_at, response_note,
  reminder_count, last_outbound_at, last_inbound_at, needs_attention, created_at
`

/**
 * Absolute base URL for links we text out. A relative URL is useless in an SMS,
 * so this falls back to Vercel's injected domain and returns '' only when there
 * is genuinely nothing to build a link from — callers drop the link in that case.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`

  console.warn('[schedule-assignments] NEXT_PUBLIC_APP_URL is unset — texted links will be omitted')
  return ''
}

export function confirmPageUrl(token: string): string {
  const base = appUrl()
  return base ? `${base}/appt/${token}` : ''
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** "Mon, Sep 8" / "Mon, Sep 8 – Wed, Sep 10" */
export function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const start = parseDay(startDate)
  const end = parseDay(endDate)
  if (startDate === endDate) return fmt(start)
  return `${fmt(start)} - ${fmt(end)}`
}

export function jobAddress(job: AssignmentContext['job']): string {
  const cityState = [job.city, job.state].filter(Boolean).join(', ')
  return [job.site_address, cityState, job.postal_code].filter(Boolean).join(' ')
}

// ─── Loading ──────────────────────────────────────────────────────────────────

async function hydrate(
  admin: AdminClient,
  assignment: ScheduleAssignment
): Promise<AssignmentContext | null> {
  const [{ data: item }, { data: job }] = await Promise.all([
    admin
      .from('schedule_items')
      .select('id, title, description, start_date, end_date, type, trade, status')
      .eq('id', assignment.schedule_item_id)
      .single(),
    admin
      .from('jobs')
      .select('id, name, job_number, site_address, city, state, postal_code, client_name')
      .eq('id', assignment.job_id)
      .single(),
  ])

  if (!item || !job) return null
  return {
    assignment,
    item: item as AssignmentContext['item'],
    job: job as AssignmentContext['job'],
  }
}

export async function loadAssignmentById(
  admin: AdminClient,
  id: string
): Promise<AssignmentContext | null> {
  const { data } = await admin.from('schedule_assignments').select(ASSIGNMENT_SELECT).eq('id', id).single()
  if (!data) return null
  return hydrate(admin, data as ScheduleAssignment)
}

export async function loadAssignmentByToken(
  admin: AdminClient,
  token: string
): Promise<AssignmentContext | null> {
  const { data } = await admin
    .from('schedule_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('token', token)
    .single()
  if (!data) return null
  return hydrate(admin, data as ScheduleAssignment)
}

/**
 * Finds the invite an inbound text belongs to: the most recently contacted
 * open assignment for that number. A sub working two JDC jobs replies about the
 * one we texted last, which is the one they are looking at on their phone.
 */
export async function loadAssignmentByPhone(
  admin: AdminClient,
  phone: string
): Promise<AssignmentContext | null> {
  const { data } = await admin
    .from('schedule_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('phone', phone)
    .in('status', ['sent', 'confirmed', 'declined'])
    .order('last_outbound_at', { ascending: false, nullsFirst: false })
    .limit(1)

  const row = data?.[0] as ScheduleAssignment | undefined
  if (!row) return null
  return hydrate(admin, row)
}

// ─── Message templates ────────────────────────────────────────────────────────

export function buildInviteMessage(ctx: AssignmentContext, isReminder = false): string {
  const { item, job, assignment } = ctx
  const firstName = assignment.contact_name.split(' ')[0]
  const lead = isReminder
    ? `${firstName} — following up on this JDC Construction schedule request:`
    : `Hi ${firstName}, this is Fixer with JDC Construction.`

  return [
    lead,
    '',
    item.title,
    formatDateRange(item.start_date, item.end_date),
    `${job.name} — ${jobAddress(job)}`,
    '',
    "Reply YES to confirm or NO if you can't make it. Any questions, just reply here.",
  ].join('\n')
}

export function buildConfirmedMessage(ctx: AssignmentContext): string {
  const firstName = ctx.assignment.contact_name.split(' ')[0]
  const link = confirmPageUrl(ctx.assignment.token)
  return [
    `Thanks ${firstName} — you're confirmed for ${ctx.item.title} on ${formatDateRange(ctx.item.start_date, ctx.item.end_date)}.`,
    ...(link ? ['', `Add it to your calendar: ${link}`] : []),
  ].join('\n')
}

export function buildDeclinedMessage(ctx: AssignmentContext): string {
  return `Understood — I've let the JDC team know you can't make ${ctx.item.title} on ${formatDateRange(ctx.item.start_date, ctx.item.end_date)}. Someone will reach out.`
}

// ─── Sending + logging ────────────────────────────────────────────────────────

export async function logMessage(
  admin: AdminClient,
  args: {
    assignmentId: string
    direction: 'inbound' | 'outbound'
    body: string
    fromNumber?: string | null
    toNumber?: string | null
    twilioSid?: string | null
    intent?: string | null
    aiGenerated?: boolean
  }
): Promise<void> {
  const { error } = await admin.from('schedule_assignment_messages').insert({
    assignment_id: args.assignmentId,
    direction: args.direction,
    body: args.body,
    from_number: args.fromNumber ?? null,
    to_number: args.toNumber ?? null,
    twilio_sid: args.twilioSid ?? null,
    intent: args.intent ?? null,
    ai_generated: args.aiGenerated ?? false,
  })
  if (error) console.error('[schedule-assignments] message log failed', error)
}

/**
 * Texts the assignee and records the outbound message. Returns the failure
 * reason instead of throwing so a partial batch still reports per-person status.
 */
export async function sendAssignmentSms(
  admin: AdminClient,
  ctx: AssignmentContext,
  body: string,
  opts: { aiGenerated?: boolean; markSent?: boolean; incrementReminder?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  const { assignment } = ctx
  if (!assignment.phone) return { ok: false, error: 'No phone number on file' }

  const result = await sendSms(assignment.phone, body)

  // Log either way — a failed send has to be visible in the thread, or the
  // office reads an undelivered message as one the sub received.
  await logMessage(admin, {
    assignmentId: assignment.id,
    direction: 'outbound',
    body: result.ok ? body : `[NOT DELIVERED — ${result.error}]\n${body}`,
    toNumber: assignment.phone,
    twilioSid: result.sid ?? null,
    aiGenerated: opts.aiGenerated,
  })

  if (!result.ok) return { ok: false, error: result.error }

  const updates: Record<string, unknown> = { last_outbound_at: new Date().toISOString() }
  if (opts.markSent && assignment.status === 'pending') {
    updates.status = 'sent'
    updates.invited_at = new Date().toISOString()
  }
  if (opts.incrementReminder) updates.reminder_count = assignment.reminder_count + 1

  await admin.from('schedule_assignments').update(updates).eq('id', assignment.id)
  return { ok: true }
}

// ─── Responses ────────────────────────────────────────────────────────────────

export type ResponseSource = 'sms' | 'web'

/**
 * Records a confirm or decline and alerts the job's PM. Idempotent for the same
 * answer — a sub texting "YES" twice does not produce two notifications.
 */
export async function recordResponse(
  admin: AdminClient,
  ctx: AssignmentContext,
  answer: 'confirmed' | 'declined',
  opts: { note?: string | null; source: ResponseSource } = { source: 'sms' }
): Promise<AssignmentContext> {
  const { assignment, item, job } = ctx
  const alreadyAnswered = assignment.status === answer

  const { data: updated } = await admin
    .from('schedule_assignments')
    .update({
      status: answer,
      responded_at: new Date().toISOString(),
      response_note: opts.note ?? assignment.response_note,
      needs_attention: false,
    })
    .eq('id', assignment.id)
    .select(ASSIGNMENT_SELECT)
    .single()

  const next: AssignmentContext = {
    ...ctx,
    assignment: (updated as ScheduleAssignment | null) ?? { ...assignment, status: answer },
  }

  if (!alreadyAnswered) {
    const targets = await getJobNotifyTargets(job.id, admin)
    const dates = formatDateRange(item.start_date, item.end_date)
    await notify({
      admin,
      userIds: targets,
      type: answer === 'confirmed' ? 'schedule_confirmed' : 'schedule_declined',
      title:
        answer === 'confirmed'
          ? `${assignment.contact_name} confirmed ${item.title}`
          : `${assignment.contact_name} declined ${item.title}`,
      body: `${job.job_number} ${job.name} · ${dates}${opts.note ? ` · "${opts.note}"` : ''}`,
      link: `/jobs/${job.id}/schedule`,
    })
  }

  return next
}

/** Flags an assignment for a human when Fixer cannot answer on its own. */
export async function flagForHuman(
  admin: AdminClient,
  ctx: AssignmentContext,
  question: string
): Promise<void> {
  await admin
    .from('schedule_assignments')
    .update({ needs_attention: true })
    .eq('id', ctx.assignment.id)

  const targets = await getJobNotifyTargets(ctx.job.id, admin)
  await notify({
    admin,
    userIds: targets,
    type: 'schedule_question',
    title: `${ctx.assignment.contact_name} asked about ${ctx.item.title}`,
    body: `"${question}" — ${ctx.job.job_number} ${ctx.job.name}`,
    link: `/jobs/${ctx.job.id}/schedule`,
  })
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function escapeIcal(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Single-event .ics for one assignee's appointment. */
export function buildAssignmentIcs(ctx: AssignmentContext): string {
  const { assignment, item, job } = ctx
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  // All-day VEVENTs use an exclusive DTEND, so the last scheduled day needs +1
  // or calendars drop it.
  const endExclusive = new Date(parseDay(item.end_date).getTime() + 86_400_000)
  const toIcalDate = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const detailsLink = confirmPageUrl(assignment.token)
  const description = [
    `Job: ${job.job_number} - ${job.name}`,
    item.trade ? `Trade: ${item.trade}` : null,
    item.description,
    detailsLink ? `Details: ${detailsLink}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JDC Construction//BuildOS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:assignment-${assignment.id}@jdc-platform`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${item.start_date.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${toIcalDate(endExclusive)}`,
    `SUMMARY:${escapeIcal(`${item.title} - ${job.name}`)}`,
    `LOCATION:${escapeIcal(jobAddress(job))}`,
    `DESCRIPTION:${escapeIcal(description)}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT12H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcal(item.title)} tomorrow`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Google Calendar "add event" URL — the one-tap option on Android. */
export function googleCalendarUrl(ctx: AssignmentContext): string {
  const { item, job } = ctx
  const endExclusive = new Date(parseDay(item.end_date).getTime() + 86_400_000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${item.title} - ${job.name}`,
    dates: `${item.start_date.replace(/-/g, '')}/${fmt(endExclusive)}`,
    location: jobAddress(job),
    details: `${job.job_number} - ${job.name}${item.description ? `\n${item.description}` : ''}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
