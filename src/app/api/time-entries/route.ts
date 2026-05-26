import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')
  const userId = searchParams.get('user_id')
  const approvalStatus = searchParams.get('approval_status')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const qbSynced = searchParams.get('qb_synced')

  const admin = createAdminClient()

  // Admins see all; field crew see only their own
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  const isAdmin = !!perm?.can_manage

  let query = admin
    .from('time_entries')
    .select('*, user:users(id, full_name, avatar_url, hourly_rate), job:jobs(id, name)')
    .order('clock_in', { ascending: false })

  if (!isAdmin) query = query.eq('user_id', user.id)
  if (jobId) query = query.eq('job_id', jobId)
  if (userId && isAdmin) query = query.eq('user_id', userId)
  if (approvalStatus) query = query.eq('approval_status', approvalStatus)
  if (dateFrom) query = query.gte('clock_in', dateFrom)
  if (dateTo) query = query.lte('clock_in', dateTo)
  if (qbSynced !== null) query = query.eq('qb_synced', qbSynced === 'true')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    job_id,
    clock_in,
    clock_out,
    break_minutes,
    cost_code,
    notes,
    tags,
    // admin can record for another user
    user_id: targetUserId,
    // GPS / location fields
    clock_in_latitude,
    clock_in_longitude,
    clock_in_accuracy_meters,
    location_status,
    device_info,
  } = body

  if (!job_id || !clock_in) {
    return NextResponse.json({ error: 'job_id and clock_in are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Determine admin status
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  const isAdmin = !!perm?.can_manage

  // Resolve target user — non-admins can only clock in for themselves
  const entryUserId = targetUserId ?? user.id
  if (!isAdmin && targetUserId && targetUserId !== user.id) {
    return NextResponse.json(
      { error: 'Cannot create time entries for other users' },
      { status: 403 },
    )
  }

  // Guard: prevent a second open shift for the same user
  const { data: openShift } = await admin
    .from('time_entries')
    .select('id')
    .eq('user_id', entryUserId)
    .is('clock_out', null)
    .maybeSingle()

  if (openShift) {
    return NextResponse.json(
      { error: 'You already have an open shift. Clock out before starting a new one.' },
      { status: 409 },
    )
  }

  // Snapshot hourly rates at time of entry
  const { data: userData } = await admin
    .from('users')
    .select('hourly_rate, overtime_rate')
    .eq('id', entryUserId)
    .single()

  // Compute hours if clock_out is provided up-front (admin backfill scenario)
  let regularHours = 0
  let overtimeHours = 0
  if (clock_out) {
    const brkMins = break_minutes ?? 0
    const totalMs = new Date(clock_out).getTime() - new Date(clock_in).getTime()
    const netMs = Math.max(0, totalMs - brkMins * 60_000)
    const netHrs = netMs / 3_600_000
    regularHours = parseFloat(Math.min(netHrs, 8).toFixed(2))
    overtimeHours = parseFloat(Math.max(0, netHrs - 8).toFixed(2))
  }

  const { data, error } = await admin
    .from('time_entries')
    .insert({
      job_id,
      user_id: entryUserId,
      clock_in,
      clock_out: clock_out ?? null,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      break_minutes: break_minutes ?? 0,
      cost_code: cost_code ?? null,
      hourly_rate: userData?.hourly_rate ?? null,
      overtime_rate: userData?.overtime_rate ?? null,
      notes: notes ?? null,
      tags: tags ?? [],
      // GPS
      clock_in_latitude: clock_in_latitude ?? null,
      clock_in_longitude: clock_in_longitude ?? null,
      clock_in_accuracy_meters: clock_in_accuracy_meters ?? null,
      location_status: location_status ?? null,
      device_info: device_info ?? null,
      created_by: user.id,
    })
    .select('*, user:users(id, full_name, avatar_url), job:jobs(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
