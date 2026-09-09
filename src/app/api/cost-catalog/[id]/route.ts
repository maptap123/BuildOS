import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { splitOrDefault, toCost, unitCostFrom } from '@/lib/estimates/costBreakdown'

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/cost-catalog/[id] — correct a cost book price for good.
 *
 * Deliberately not the same action as editing a line. A line edit prices one job; this
 * changes what every estimate written from here on picks up for this cost code. Estimates
 * that already exist keep their own copy of the price and are left alone — a correction
 * today must not silently reprice a proposal a client has already been sent.
 *
 * The three buckets are the price; unit_cost is their sum, never typed. cost_catalog
 * stores 0 rather than null in a bucket it has no cost for.
 */
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

  const split = splitOrDefault(body.unit_cost, {
    labor_cost:    toCost(body.labor_cost),
    material_cost: toCost(body.material_cost),
    sub_cost:      toCost(body.sub_cost),
  })

  const buckets = {
    labor_cost:    split.labor_cost    ?? 0,
    material_cost: split.material_cost ?? 0,
    sub_cost:      split.sub_cost      ?? 0,
  }

  if (Object.values(buckets).some(n => !Number.isFinite(n) || n < 0)) {
    return NextResponse.json({ error: 'Costs must be zero or a positive number' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cost_catalog')
    .update({
      ...buckets,
      unit_cost:  unitCostFrom(split) ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, cost_code, title, uom, unit_cost, labor_cost, material_cost, sub_cost')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cost code not found' }, { status: 404 })
  return NextResponse.json(data)
}
