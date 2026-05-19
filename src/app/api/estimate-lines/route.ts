import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/estimate-lines?estimate_id=<uuid>
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
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

  const { data: perm } = await supabase
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
    quantity = 1, unit_cost = 0, markup_pct = 0,
    sort_order = 0, notes,
  } = body

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
      unit_cost:     Number(unit_cost),
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

  const { data: perm } = await supabase
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
  const allowed = ['description', 'phase', 'cost_code', 'uom', 'quantity', 'unit_cost', 'markup_pct', 'sort_order', 'notes']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) {
      updates[k] = ['quantity','unit_cost','markup_pct','sort_order'].includes(k)
        ? Number(body[k])
        : body[k]
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('estimate_lines')
    .update(updates)
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

  const { data: perm } = await supabase
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
