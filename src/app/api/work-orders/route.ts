import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vendors(id, name, trade, vendor_type), budget_lines(id, cost_code, description)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

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
    job_id,
    vendor_id = null,
    budget_line_id = null,
    title,
    description = null,
    scope_of_work = null,
    amount = 0,
    status = 'draft',
    issued_date = null,
    start_date = null,
    completion_date = null,
    notes = null,
  } = body

  if (!job_id || !title) {
    return NextResponse.json({ error: 'Missing required fields: job_id, title' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Auto-generate WO number: WO-001, WO-002, ...
  // Use MAX on the numeric suffix to avoid race conditions from concurrent inserts.
  const { data: existing } = await admin
    .from('work_orders')
    .select('wo_number')
    .eq('job_id', job_id)
    .order('wo_number', { ascending: false })
    .limit(1)

  const lastNum = existing?.[0]?.wo_number
    ? parseInt(existing[0].wo_number.replace('WO-', ''), 10)
    : 0
  const wo_number = `WO-${String(lastNum + 1).padStart(3, '0')}`

  const { data, error } = await admin
    .from('work_orders')
    .insert({
      job_id,
      vendor_id: vendor_id || null,
      budget_line_id: budget_line_id || null,
      wo_number,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      scope_of_work: scope_of_work ? String(scope_of_work).trim() : null,
      amount: Number(amount),
      status,
      issued_date: issued_date || null,
      start_date: start_date || null,
      completion_date: completion_date || null,
      notes: notes ? String(notes).trim() : null,
      created_by: user.id,
    })
    .select('*, vendors(id, name, trade, vendor_type), budget_lines(id, cost_code, description)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
