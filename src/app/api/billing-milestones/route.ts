import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ─── GET ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('billing_milestones')
    .select('*')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST ──────────────────────────────────────────────────────────────────

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
  const {
    job_id,
    title,
    description = null,
    amount,
    status = 'pending',
    due_date = null,
    invoiced_date = null,
    paid_date = null,
    invoice_number = null,
    notes = null,
    sort_order = 0,
  } = body

  if (!job_id || !title || amount === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields: job_id, title, amount' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_milestones')
    .insert({
      job_id,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      amount: Number(amount),
      status,
      due_date: due_date || null,
      invoiced_date: invoiced_date || null,
      paid_date: paid_date || null,
      invoice_number: invoice_number ? String(invoice_number).trim() : null,
      notes: notes ? String(notes).trim() : null,
      sort_order: Number(sort_order),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
