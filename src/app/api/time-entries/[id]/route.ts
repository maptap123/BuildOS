import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

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
    .select('*, user:users(id, full_name, avatar_url, hourly_rate), job:jobs(id, name)')
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
    .select('user_id, approval_status, clock_in, break_minutes')
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
    'clock_in', 'clock_out', 'regular_hours', 'overtime_hours',
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

  // Server-side hours computation when clock_out is provided.
  // Overrides any client-sent regular_hours / overtime_hours to prevent time fraud.
  if (updates.clock_out) {
    const brkMins =
      typeof updates.break_minutes === 'number'
        ? updates.break_minutes
        : (existing.break_minutes ?? 0)
    const totalMs =
      new Date(updates.clock_out as string).getTime() -
      new Date(existing.clock_in).getTime()
    const netMs = Math.max(0, totalMs - brkMins * 60_000)
    const netHrs = netMs / 3_600_000
    updates.regular_hours = parseFloat(Math.min(netHrs, 8).toFixed(2))
    updates.overtime_hours = parseFloat(Math.max(0, netHrs - 8).toFixed(2))
  }

  const { data, error } = await admin
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select('*, user:users(id, full_name, avatar_url), job:jobs(id, name)')
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
