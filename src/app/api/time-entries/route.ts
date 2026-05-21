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

  // Admins see all; field crew see only their own
  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  const isAdmin = !!perm?.can_manage

  const admin = createAdminClient()
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
    job_id, clock_in, clock_out, regular_hours, overtime_hours,
    break_minutes, cost_code, notes, tags,
    // admin can record for another user
    user_id: targetUserId,
  } = body

  if (!job_id || !clock_in) {
    return NextResponse.json({ error: 'job_id and clock_in are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Resolve which user this entry is for
  const entryUserId = targetUserId ?? user.id

  // Snapshot the user's hourly rates at time of entry
  const { data: userData } = await admin
    .from('users')
    .select('hourly_rate, overtime_rate')
    .eq('id', entryUserId)
    .single()

  const { data, error } = await admin
    .from('time_entries')
    .insert({
      job_id,
      user_id: entryUserId,
      clock_in,
      clock_out: clock_out ?? null,
      regular_hours: regular_hours ?? 0,
      overtime_hours: overtime_hours ?? 0,
      break_minutes: break_minutes ?? 0,
      cost_code: cost_code ?? null,
      hourly_rate: userData?.hourly_rate ?? null,
      overtime_rate: userData?.overtime_rate ?? null,
      notes: notes ?? null,
      tags: tags ?? [],
      created_by: user.id,
    })
    .select('*, user:users(id, full_name, avatar_url), job:jobs(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
