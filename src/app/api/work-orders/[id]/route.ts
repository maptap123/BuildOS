import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  const stringFields = ['title', 'description', 'scope_of_work', 'notes']
  for (const field of stringFields) {
    if (field in body) {
      updates[field] = body[field] ? String(body[field]).trim() : null
    }
  }
  if ('vendor_id' in body) updates.vendor_id = body.vendor_id || null
  if ('budget_line_id' in body) updates.budget_line_id = body.budget_line_id || null
  if ('amount' in body) updates.amount = Number(body.amount)
  if ('status' in body) updates.status = body.status
  if ('issued_date' in body) updates.issued_date = body.issued_date || null
  if ('start_date' in body) updates.start_date = body.start_date || null
  if ('completion_date' in body) updates.completion_date = body.completion_date || null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('work_orders')
    .update(updates)
    .eq('id', id)
    .select('*, vendors(id, name, trade, vendor_type), budget_lines(id, cost_code, description)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('work_orders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
