import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { applyChoicePick } from '@/lib/selections/choices'

type Params = { params: Promise<{ id: string }> }

/** POST — add a choice to a selection. `select: true` picks it in the same step. */
export async function POST(request: Request, { params }: Params) {
  const { id: selectionId } = await params
  const auth = await requireSelectionsPerm('can_create')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: selection } = await admin.from('selections').select('id').eq('id', selectionId).single()
  if (!selection) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Choice name is required' }, { status: 400 })
  const clientPrice = Number(body.client_price ?? 0)
  if (!Number.isFinite(clientPrice)) return NextResponse.json({ error: 'Price must be a number' }, { status: 400 })
  const builderCost = body.builder_cost === '' || body.builder_cost == null ? null : Number(body.builder_cost)

  const { data: choice, error } = await admin
    .from('selection_choices')
    .insert({
      selection_id: selectionId,
      title,
      details: String(body.details ?? '').trim() || null,
      product_url: String(body.product_url ?? '').trim() || null,
      vendor_id: body.vendor_id || null,
      client_price: clientPrice,
      builder_cost: builderCost !== null && Number.isFinite(builderCost) ? builderCost : null,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const overage = body.select ? await applyChoicePick(admin, choice.id, true, user.id) : null
  return NextResponse.json({ choice, overage }, { status: 201 })
}
