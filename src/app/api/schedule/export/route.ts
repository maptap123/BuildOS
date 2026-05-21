import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/schedule/export?job_id=xxx
 * Returns an iCalendar (.ics) file for all schedule items on a job.
 * Compatible with Outlook, Google Calendar, Apple Calendar.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'schedule')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const { data: job } = await admin
    .from('jobs')
    .select('name, job_number')
    .eq('id', jobId)
    .single()

  const { data: items, error } = await admin
    .from('schedule_items')
    .select('*')
    .eq('job_id', jobId)
    .order('start_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const jobName = job ? `${job.job_number} - ${job.name}` : 'JDC Job'

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  function toICalDate(dateStr: string) {
    return dateStr.replace(/-/g, '')
  }

  function escapeIcal(str: string) {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  }

  const events = (items ?? []).map(item => {
    const uid = `${item.id}@jdc-platform`
    const dtstart = toICalDate(item.start_date)
    const dtend   = toICalDate(item.end_date)

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcal(item.title)}`,
      item.description ? `DESCRIPTION:${escapeIcal(item.description)}` : null,
      item.trade ? `CATEGORIES:${escapeIcal(item.trade)}` : null,
      `STATUS:${item.status === 'completed' ? 'COMPLETED' : item.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      `PERCENT-COMPLETE:${item.percent_complete ?? 0}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  }).join('\r\n')

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JDC Platform//BuildOS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(jobName)} Schedule`,
    'X-WR-TIMEZONE:America/New_York',
    events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${job?.job_number ?? 'schedule'}.ics"`,
    },
  })
}
