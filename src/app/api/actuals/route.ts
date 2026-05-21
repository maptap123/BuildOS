import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')
  const budgetLineId = searchParams.get('budget_line_id')

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
  let query = admin.from('actuals').select('*').order('incurred_date', { ascending: false })
  if (jobId) query = query.eq('job_id', jobId)
  if (budgetLineId) query = query.eq('budget_line_id', budgetLineId)

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
    job_id, budget_line_id, vendor_name, invoice_number,
    description, amount, status = 'pending', incurred_date,
  } = body

  if (!job_id || !description || !amount || !incurred_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('actuals')
    .insert({
      job_id,
      budget_line_id: budget_line_id ?? null,
      vendor_name: vendor_name ?? null,
      invoice_number: invoice_number ?? null,
      description,
      amount,
      status,
      incurred_date,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
