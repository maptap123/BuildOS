import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase.from('budget_lines').select('*').order('cost_code')
  if (jobId) query = query.eq('job_id', jobId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { job_id, cost_code, category, description, status = 'draft', original_budget = 0, notes } = body
  if (!job_id || !cost_code || !category || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('budget_lines')
    .insert({
      job_id, cost_code, category, description, status,
      original_budget, revised_budget: original_budget,
      committed_cost: 0, notes: notes ?? null, created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
