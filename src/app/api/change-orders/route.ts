import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  let query = admin
    .from('change_orders')
    .select('*, approved_by_user:approved_by(full_name)')
    .order('co_number')

  if (jobId) query = query.eq('job_id', jobId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    job_id, title, description, status = 'draft', type = 'additive',
    amount = 0, reason, submitted_date, budget_line_id,
  } = body

  if (!job_id || !title) {
    return NextResponse.json({ error: 'Missing required fields: job_id, title' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Auto-generate CO number: CO-001, CO-002, etc.
  const { data: existing } = await admin
    .from('change_orders')
    .select('co_number')
    .eq('job_id', job_id)
    .order('co_number', { ascending: false })
    .limit(1)

  const lastNum = existing?.[0]?.co_number
    ? parseInt(existing[0].co_number.replace('CO-', ''), 10)
    : 0
  const co_number = `CO-${String(lastNum + 1).padStart(3, '0')}`

  const { data, error } = await admin
    .from('change_orders')
    .insert({
      job_id, co_number, title,
      description: description ?? null,
      status, type,
      amount: Number(amount),
      reason: reason ?? null,
      submitted_date: submitted_date ?? null,
      budget_line_id: budget_line_id ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
