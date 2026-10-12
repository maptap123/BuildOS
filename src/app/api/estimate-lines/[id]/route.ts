import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BREAKDOWN_FIELDS, reconcileLineUpdate, touchesPricing } from '@/lib/estimates/costBreakdown'
import { rememberAllowance } from '@/lib/estimates/allowances'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/estimate-lines/[id]
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const allowed = ['description', 'phase', 'cost_code', 'uom', 'quantity', 'unit_cost', 'markup_pct', 'sort_order', 'notes', 'allowance', 'client_visible', 'internal_note', ...BREAKDOWN_FIELDS]
  const numericFields = ['quantity', 'unit_cost', 'markup_pct', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) {
      updates[k] = numericFields.includes(k) ? Number(body[k]) : body[k]
    }
  }

  const admin = createAdminClient()

  // A partial update can set labor without mentioning material, so the stored buckets
  // are needed to recompute unit_cost from the whole line rather than half of it.
  let merged = updates
  if (touchesPricing(updates)) {
    const { data: current } = await admin
      .from('estimate_lines')
      .select('labor_cost, material_cost, sub_cost')
      .eq('id', id)
      .maybeSingle()
    merged = reconcileLineUpdate(updates, current ?? undefined)
  }

  // The builder sends every field on every autosave, so the allowance is only worth
  // remembering for the cost code when it actually changed on this line.
  let before: { allowance: string | null; cost_code: string | null } | null = null
  if ('allowance' in merged) {
    const { data: current, error: readErr } = await admin
      .from('estimate_lines')
      .select('allowance, cost_code')
      .eq('id', id)
      .maybeSingle()
    // Before migration 058 the column doesn't exist; save the rest of the line anyway.
    if (readErr) {
      merged = { ...merged }
      delete merged.allowance
    } else {
      before = current
    }
  }

  const { data, error } = await admin
    .from('estimate_lines')
    .update(merged)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before && (before.allowance ?? '') !== (data.allowance ?? '')) {
    await rememberAllowance(admin, data.cost_code, data.allowance, user.id)
  }

  return NextResponse.json(data)
}

// DELETE /api/estimate-lines/[id]
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('estimate_lines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
