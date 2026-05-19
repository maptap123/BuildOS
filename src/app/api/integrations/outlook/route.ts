import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET  /api/integrations/outlook  — connection status
 * POST /api/integrations/outlook  — sync schedule items for a job to Outlook calendar
 *
 * Microsoft 365 / Outlook Calendar sync:
 * - Each schedule_item maps to an Outlook calendar event
 * - Two-way sync: changes in JDC update Outlook, Outlook invites add to schedule
 * - Requires Microsoft 365 OAuth via MSAL (to be configured)
 */

export async function GET() {
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

  if (!adminPerm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('integration_settings')
    .select('service, is_connected, connected_at, last_sync_at, sync_error')
    .eq('service', 'outlook')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: schedulePerm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'schedule')
    .single()

  if (!schedulePerm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { job_id, item_ids } = await request.json()
  if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: integration } = await admin
    .from('integration_settings')
    .select('is_connected')
    .eq('service', 'outlook')
    .single()

  if (!integration?.is_connected) {
    return NextResponse.json({
      error: 'Outlook is not connected. Configure the Microsoft 365 integration in Settings → Integrations.',
      setup_required: true,
    }, { status: 422 })
  }

  // Fetch schedule items to sync
  let query = admin
    .from('schedule_items')
    .select('*')
    .eq('job_id', job_id)

  if (item_ids?.length) query = query.in('id', item_ids)

  const { data: items } = await query

  // Mark items as pending sync
  if (items?.length) {
    await admin
      .from('schedule_items')
      .update({ outlook_sync_status: 'pending' })
      .in('id', items.map((i: { id: string }) => i.id))
  }

  // TODO: When Microsoft 365 OAuth tokens are stored:
  //   For each schedule_item:
  //     - If outlook_event_id is null: POST /v1.0/me/calendars/{calendarId}/events → creates event
  //     - If outlook_event_id exists: PATCH /v1.0/me/events/{eventId} → updates event
  //   Map fields:
  //     subject       = item.title
  //     body.content  = item.description
  //     start.dateTime = item.start_date + 'T07:00:00'
  //     end.dateTime   = item.end_date   + 'T17:00:00'
  //     categories     = [item.trade, item.status]
  //   On success: update outlook_event_id, outlook_sync_status='synced'
  //
  // Reference: https://learn.microsoft.com/en-us/graph/api/calendar-post-events

  return NextResponse.json({
    message: 'Outlook calendar sync queued',
    note: 'Full Microsoft 365 OAuth integration will be completed when configured.',
    items_queued: items?.length ?? 0,
    job_id,
  })
}
