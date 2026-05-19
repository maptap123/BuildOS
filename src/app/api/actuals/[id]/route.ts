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
  const {
    status,
    vendor_name,
    invoice_number,
    amount,
    description,
    incurred_date,
    budget_line_id,
    notes,
  } = body

  // Build update payload, only including defined fields
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined) updates.status = status
  if (vendor_name !== undefined) updates.vendor_name = vendor_name
  if (invoice_number !== undefined) updates.invoice_number = invoice_number
  if (amount !== undefined) updates.amount = amount
  if (description !== undefined) updates.description = description
  if (incurred_date !== undefined) updates.incurred_date = incurred_date
  if (budget_line_id !== undefined) updates.budget_line_id = budget_line_id
  if (notes !== undefined) updates.notes = notes

  // When approving, stamp approved_by and approved_at
  if (status === 'approved') {
    updates.approved_by = user.id
    updates.approved_at = new Date().toISOString()
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('actuals')
    .update(updates)
    .eq('id', id)
    .select()
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
  const { error } = await admin.from('actuals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
