import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { applyChoicePick } from '@/lib/selections/choices'
import { reconcileAllowanceOverage } from '@/lib/selections/overage'

type Params = { params: Promise<{ choiceId: string }> }

/**
 * PATCH — edit a choice, or pick it (`is_selected: true`) / clear it (`false`).
 * A new price on a picked choice re-works the allowance's overage too.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { choiceId } = await params
  const auth = await requireSelectionsPerm('can_edit')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: current } = await admin
    .from('selection_choices')
    .select('id, is_selected, client_price, selections(allowance_id)')
    .eq('id', choiceId)
    .single()
  if (!current) return NextResponse.json({ error: 'Choice not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Choice name is required' }, { status: 400 })
    patch.title = title
  }
  if ('details' in body) patch.details = String(body.details ?? '').trim() || null
  if ('product_url' in body) patch.product_url = String(body.product_url ?? '').trim() || null
  if ('vendor_id' in body) patch.vendor_id = body.vendor_id || null
  if ('client_price' in body) {
    const n = Number(body.client_price)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'Price must be a number' }, { status: 400 })
    patch.client_price = n
  }
  if ('builder_cost' in body) {
    const n = body.builder_cost === '' || body.builder_cost == null ? null : Number(body.builder_cost)
    patch.builder_cost = n !== null && Number.isFinite(n) ? n : null
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from('selection_choices').update(patch).eq('id', choiceId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let overage = null
  if ('is_selected' in body && Boolean(body.is_selected) !== current.is_selected) {
    overage = await applyChoicePick(admin, choiceId, Boolean(body.is_selected), user.id)
  } else if (current.is_selected && 'client_price' in patch && Number(patch.client_price) !== Number(current.client_price)) {
    const allowanceId = (current.selections as unknown as { allowance_id: string | null } | null)?.allowance_id
    overage = await reconcileAllowanceOverage(admin, allowanceId, user.id)
  }

  const { data: choice } = await admin.from('selection_choices').select('*').eq('id', choiceId).single()
  return NextResponse.json({ choice, overage })
}

/** DELETE — removes a choice; if it was the picked one, the selection goes back to pending. */
export async function DELETE(_request: Request, { params }: Params) {
  const { choiceId } = await params
  const auth = await requireSelectionsPerm('can_delete')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: current } = await admin
    .from('selection_choices')
    .select('id, is_selected')
    .eq('id', choiceId)
    .single()
  if (!current) return NextResponse.json({ error: 'Choice not found' }, { status: 404 })

  // Clearing it first runs the status + overage bookkeeping.
  if (current.is_selected) await applyChoicePick(admin, choiceId, false, user.id)

  const { error } = await admin.from('selection_choices').delete().eq('id', choiceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
