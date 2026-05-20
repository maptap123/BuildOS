import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ─── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  const body = await request.json()

  const allowed = [
    'title', 'description', 'amount', 'status',
    'due_date', 'invoiced_date', 'paid_date',
    'invoice_number', 'notes', 'sort_order',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) {
      const val = body[key]
      if (key === 'amount') {
        updates[key] = Number(val)
      } else if (key === 'sort_order') {
        updates[key] = Number(val)
      } else if (key === 'title' || key === 'description' || key === 'invoice_number' || key === 'notes') {
        updates[key] = val ? String(val).trim() : null
      } else {
        updates[key] = val || null
      }
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_milestones')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  return NextResponse.json(data)
}

// ─── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params

  const admin = createAdminClient()
  const { error } = await admin.from('billing_milestones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
