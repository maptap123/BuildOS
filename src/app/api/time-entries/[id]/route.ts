import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { laborCost } from '@/lib/timeClock'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('time_entries')
    .select('*, user:users!user_id(id, full_name, avatar_url, hourly_rate), job:jobs!job_id(id, name)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  if (data.user_id !== user.id) {
    // Non-admin can only view their own
    const { data: perm } = await createAdminClient()
      .from('user_permissions')
      .select('can_manage')
      .eq('user_id', user.id)
      .eq('module', 'admin')
      .single()
    if (!perm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(data)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Fetch the existing entry — include clock_in and break_minutes for server-side hour computation
  const { data: existing } = await admin
    .from('time_entries')
    .select('user_id, approval_status, clock_in, clock_out, break_minutes, hourly_rate, overtime_rate')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check admin status
  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  const isAdmin = !!perm?.can_manage

  // Only owner (if pending) or admin can update
  if (!isAdmin && (existing.user_id !== user.id || existing.approval_status !== 'pending')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  // Field allow-lists — admins get more fields; crew gets clock-out fields only
  const adminAllowed = [
    'job_id', 'clock_in', 'clock_out', 'regular_hours', 'overtime_hours',
    'break_minutes', 'cost_code', 'notes', 'tags',
    'clock_out_latitude', 'clock_out_longitude', 'clock_out_accuracy_meters',
  ]
  const crewAllowed = [
    'clock_out', 'break_minutes', 'cost_code', 'notes',
    'clock_out_latitude', 'clock_out_longitude', 'clock_out_accuracy_meters',
  ]
  const allowedFields = isAdmin ? adminAllowed : crewAllowed

  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  // Server-side hours computation whenever a time field changes.
  // Overrides any client-sent regular_hours / overtime_hours to prevent time fraud.
  if ('clock_in' in updates || 'clock_out' in updates || 'break_minutes' in updates) {
    const inIso = (updates.clock_in as string | undefined) ?? existing.clock_in
    const outIso = 'clock_out' in updates ? (updates.clock_out as string | null) : existing.clock_out
    if (!outIso && existing.clock_out) {
      return NextResponse.json({ error: 'A finished shift can’t be reopened — add a new shift instead.' }, { status: 400 })
    }
    const inMs = new Date(inIso).getTime()
    if (Number.isNaN(inMs)) {
      return NextResponse.json({ error: 'Invalid clock-in time.' }, { status: 400 })
    }
    if (inMs > Date.now() + 5 * 60_000) {
      return NextResponse.json({ error: 'Clock-in time can’t be in the future.' }, { status: 400 })
    }
    if (outIso) {
      // A forgotten shift is closed with the time the crew actually stopped, so
      // clock_out can be in the past — but never before clock_in or in the future.
      const outMs = new Date(outIso).getTime()
      if (Number.isNaN(outMs) || outMs <= inMs) {
        return NextResponse.json({ error: 'Clock-out time must be after the clock-in time.' }, { status: 400 })
      }
      if (outMs > Date.now() + 5 * 60_000) {
        return NextResponse.json({ error: 'Clock-out time can’t be in the future.' }, { status: 400 })
      }
      const brkMins =
        typeof updates.break_minutes === 'number'
          ? updates.break_minutes
          : (existing.break_minutes ?? 0)
      const netHrs = Math.max(0, outMs - inMs - brkMins * 60_000) / 3_600_000
      updates.regular_hours = parseFloat(Math.min(netHrs, 8).toFixed(2))
      updates.overtime_hours = parseFloat(Math.max(0, netHrs - 8).toFixed(2))
      updates.labor_cost = laborCost(
        updates.regular_hours as number, updates.overtime_hours as number,
        existing.hourly_rate, existing.overtime_rate,
      )
    } else {
      // Still open — hours accrue at clock-out
      updates.regular_hours = 0
      updates.overtime_hours = 0
      updates.labor_cost = null
    }
  }

  const { data, error } = await admin
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select('*, user:users!user_id(id, full_name, avatar_url, hourly_rate), job:jobs!job_id(id, name, job_number)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  if (!perm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('time_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
