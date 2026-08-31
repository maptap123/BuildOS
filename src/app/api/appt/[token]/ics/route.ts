import { createAdminClient } from '@/lib/supabase/admin'
import { buildAssignmentIcs, loadAssignmentByToken } from '@/lib/schedule/assignments'
import { NextResponse } from 'next/server'

// Public route — token-authenticated. This is what the "Add to calendar" button
// on the sub's phone downloads, so it must work with no session.

/** GET /api/appt/[token]/ics — one-event .ics for this person's appointment. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const ctx = await loadAssignmentByToken(admin, token)
  if (!ctx) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  const fileName = `${ctx.job.job_number}-${ctx.item.title}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  return new NextResponse(buildAssignmentIcs(ctx), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName || 'appointment'}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
