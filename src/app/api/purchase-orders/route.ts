import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ─── helpers ───────────────────────────────────────────────────────────────

/** Adjust committed_cost on a budget line by `delta`. No-op if lineId is null. */
async function adjustCommitted(lineId: string | null, delta: number) {
  if (!lineId || delta === 0) return
  const admin = createAdminClient()
  const { data: line, error: fetchErr } = await admin
    .from('budget_lines')
    .select('committed_cost')
    .eq('id', lineId)
    .single()
  if (fetchErr || !line) return
  await admin
    .from('budget_lines')
    .update({ committed_cost: (line.committed_cost ?? 0) + delta })
    .eq('id', lineId)
}

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
    .from('purchase_orders')
    .select('*, budget_lines(cost_code, description)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

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
    budget_line_id = null,
    vendor_name,
    po_number = null,
    description,
    amount,
    status = 'draft',
    issued_date = null,
    expected_date = null,
    notes = null,
  } = body

  if (!job_id || !vendor_name || !description || amount === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields: job_id, vendor_name, description, amount' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('purchase_orders')
    .insert({
      job_id,
      budget_line_id: budget_line_id || null,
      vendor_name: String(vendor_name).trim(),
      po_number: po_number ? String(po_number).trim() : null,
      description: String(description).trim(),
      amount: Number(amount),
      status,
      issued_date: issued_date || null,
      expected_date: expected_date || null,
      notes: notes ? String(notes).trim() : null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync committed_cost on the linked budget line (skip if cancelled)
  if (budget_line_id && status !== 'cancelled') {
    await adjustCommitted(budget_line_id, Number(amount))
  }

  return NextResponse.json(data, { status: 201 })
}

// ─── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(request: Request) {
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
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing PO id' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch existing PO to compute committed_cost deltas
  const { data: existing, error: fetchErr } = await admin
    .from('purchase_orders')
    .select('status, amount, budget_line_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const oldStatus     = existing.status as string
  const newStatus     = updates.status ?? oldStatus
  const oldAmount     = Number(existing.amount)
  const newAmount     = updates.amount !== undefined ? Number(updates.amount) : oldAmount
  const oldLineId     = existing.budget_line_id as string | null
  const newLineId     = updates.budget_line_id !== undefined ? (updates.budget_line_id || null) : oldLineId

  const wasActive = oldStatus !== 'cancelled'
  const isActive  = newStatus !== 'cancelled'

  // Determine committed_cost adjustment:
  // 1. If the budget line changed, reverse the old line's contribution and apply to new line
  // 2. If status toggled between active/cancelled, adjust accordingly
  // 3. If amount changed on an active PO, adjust the diff

  if (oldLineId !== newLineId) {
    // Remove from old line
    if (oldLineId && wasActive) {
      await adjustCommitted(oldLineId, -oldAmount)
    }
    // Add to new line
    if (newLineId && isActive) {
      await adjustCommitted(newLineId, newAmount)
    }
  } else if (wasActive && !isActive) {
    // Status changed TO cancelled — subtract
    await adjustCommitted(oldLineId, -oldAmount)
  } else if (!wasActive && isActive) {
    // Status changed FROM cancelled — add back
    await adjustCommitted(newLineId, newAmount)
  } else if (wasActive && isActive && oldAmount !== newAmount) {
    // Amount changed on active PO — apply diff
    await adjustCommitted(newLineId, newAmount - oldAmount)
  }

  // Clean up update payload
  if (updates.vendor_name) updates.vendor_name = String(updates.vendor_name).trim()
  if (updates.description) updates.description = String(updates.description).trim()
  if (updates.po_number !== undefined) updates.po_number = updates.po_number ? String(updates.po_number).trim() : null
  if (updates.notes !== undefined) updates.notes = updates.notes ? String(updates.notes).trim() : null
  if (updates.budget_line_id !== undefined) updates.budget_line_id = updates.budget_line_id || null
  if (updates.amount !== undefined) updates.amount = Number(updates.amount)

  const { data, error } = await admin
    .from('purchase_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch PO before deleting to reverse committed_cost
  const { data: existing } = await admin
    .from('purchase_orders')
    .select('status, amount, budget_line_id')
    .eq('id', id)
    .single()

  if (existing && existing.status !== 'cancelled' && existing.budget_line_id) {
    await adjustCommitted(existing.budget_line_id as string, -Number(existing.amount))
  }

  const { error } = await admin.from('purchase_orders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
