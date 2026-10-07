import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { laborCost } from '@/lib/timeClock'

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
  // With date_from: also return still-open shifts that started earlier, so a
  // shift left running overnight is never hidden from the person who owns it.
  const includeOpen = searchParams.get('include_open') === 'true'

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
    .select('*, user:users!user_id(id, full_name, avatar_url, hourly_rate), job:jobs!job_id(id, name)')
    .order('clock_in', { ascending: false })

  if (!isAdmin) query = query.eq('user_id', user.id)
  if (jobId) query = query.eq('job_id', jobId)
  if (userId && isAdmin) query = query.eq('user_id', userId)
  if (approvalStatus) query = query.eq('approval_status', approvalStatus)
  if (dateFrom && includeOpen) query = query.or(`clock_in.gte.${dateFrom},clock_out.is.null`)
  else if (dateFrom) query = query.gte('clock_in', dateFrom)
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

  // A closed shift (admin backfill) must end after it starts, and not in the future
  if (clock_out) {
    const inMs = new Date(clock_in).getTime()
    const outMs = new Date(clock_out).getTime()
    if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) {
      return NextResponse.json({ error: 'Clock-out time must be after the clock-in time.' }, { status: 400 })
    }
    if (outMs > Date.now() + 5 * 60_000) {
      return NextResponse.json({ error: 'Clock-out time can’t be in the future.' }, { status: 400 })
    }
  }

  // Guard: prevent a second open shift for the same user. Only applies when this
  // entry would itself be open — backfilling a finished shift is always allowed.
  // (limit, not maybeSingle — maybeSingle errors on 2+ rows and the guard would pass)
  if (!clock_out) {
    const { data: openShifts } = await admin
      .from('time_entries')
      .select('id')
      .eq('user_id', entryUserId)
      .is('clock_out', null)
      .limit(1)

    if (openShifts?.length) {
      const msg = entryUserId === user.id
        ? 'You already have an open shift. Clock out before starting a new one.'
        : 'This person is already clocked in. Clock them out before starting a new shift.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
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
      labor_cost: clock_out
        ? laborCost(regularHours, overtimeHours, userData?.hourly_rate, userData?.overtime_rate)
        : null,
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
    .select('*, user:users!user_id(id, full_name, avatar_url, hourly_rate), job:jobs!job_id(id, name, job_number)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
