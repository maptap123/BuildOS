import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BREAKDOWN_FIELDS, reconcileLineUpdate, splitOrDefault, toCost, touchesPricing, unitCostFrom } from '@/lib/estimates/costBreakdown'
import { DEFAULT_MARKUP_PCT } from '@/lib/estimates/aiLines'

// GET /api/estimate-lines?estimate_id=<uuid>
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const estimateId = searchParams.get('estimate_id')
  if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('estimate_lines')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/estimate-lines  — add a line
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
    estimate_id, lead_id, cost_item_id, description,
    phase, cost_code, uom = 'EA',
    quantity = 1, unit_cost = 0, markup_pct = DEFAULT_MARKUP_PCT,
    sort_order = 0, notes,
    labor_cost, material_cost, sub_cost,
  } = body

  // When the caller sends buckets, they decide the unit cost — a catalog pick carries
  // labor and material across and the total has to follow them, not the other way round.
  // With no buckets at all the price still gets a split rather than standing alone.
  const breakdown = splitOrDefault(unit_cost, {
    labor_cost:    toCost(labor_cost),
    material_cost: toCost(material_cost),
    sub_cost:      toCost(sub_cost),
  })

  if (!estimate_id || !lead_id || !description) {
    return NextResponse.json({ error: 'estimate_id, lead_id, description required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('estimate_lines')
    .insert({
      estimate_id,
      lead_id,
      cost_item_id:  cost_item_id  ?? null,
      description:   description.trim(),
      phase:         phase         ?? null,
      cost_code:     cost_code     ?? null,
      uom,
      quantity:      Number(quantity),
      unit_cost:     unitCostFrom(breakdown) ?? 0,
      labor_cost:    breakdown.labor_cost,
      material_cost: breakdown.material_cost,
      sub_cost:      breakdown.sub_cost,
      markup_pct:    Number(markup_pct),
      sort_order:    Number(sort_order),
      notes:         notes?.trim() ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/estimate-lines?id=<uuid>  — update one line
export async function PATCH(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const allowed = ['description', 'phase', 'cost_code', 'uom', 'quantity', 'unit_cost', 'markup_pct', 'sort_order', 'notes', ...BREAKDOWN_FIELDS]
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) {
      updates[k] = ['quantity','unit_cost','markup_pct','sort_order'].includes(k)
        ? Number(body[k])
        : body[k]
    }
  }

  const admin = createAdminClient()

  let merged = updates
  if (touchesPricing(updates)) {
    const { data: current } = await admin
      .from('estimate_lines')
      .select('labor_cost, material_cost, sub_cost')
      .eq('id', id)
      .maybeSingle()
    merged = reconcileLineUpdate(updates, current ?? undefined)
  }

  const { data, error } = await admin
    .from('estimate_lines')
    .update(merged)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/estimate-lines?id=<uuid>
export async function DELETE(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('estimate_lines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
