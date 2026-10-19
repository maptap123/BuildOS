import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { reconcileAllowanceOverage } from '@/lib/selections/overage'

type Params = { params: Promise<{ allowanceId: string }> }

/**
 * PATCH — edit an allowance added by hand. One that came from the estimate is changed on
 * the estimate (the next sync would overwrite an edit made here), so it is refused.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { allowanceId } = await params
  const auth = await requireSelectionsPerm('can_edit')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: current } = await admin.from('allowances').select('id, source').eq('id', allowanceId).single()
  if (!current) return NextResponse.json({ error: 'Allowance not found' }, { status: 404 })
  if (current.source === 'estimate') {
    return NextResponse.json({ error: 'This allowance comes from the estimate — change it there.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    patch.title = title
  }
  if ('amount' in body) {
    const n = Number(body.amount)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    patch.amount = n
  }

  const { data, error } = await admin.from('allowances').update(patch).eq('id', allowanceId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const overage = 'amount' in patch ? await reconcileAllowanceOverage(admin, allowanceId, user.id) : null
  return NextResponse.json({ allowance: data, overage })
}

/**
 * DELETE — removes an allowance added by hand. Its selections stay, without an allowance;
 * an unsent overage draft goes with it, a sent or approved change order is kept.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { allowanceId } = await params
  const auth = await requireSelectionsPerm('can_delete')
  if (auth instanceof NextResponse) return auth
  const { admin } = auth

  const { data: current } = await admin.from('allowances').select('id, source').eq('id', allowanceId).single()
  if (!current) return NextResponse.json({ error: 'Allowance not found' }, { status: 404 })
  if (current.source === 'estimate') {
    return NextResponse.json({ error: 'This allowance comes from the estimate — remove it there.' }, { status: 409 })
  }

  await admin.from('change_orders').delete().eq('allowance_id', allowanceId).eq('status', 'draft')
  const { error } = await admin.from('allowances').delete().eq('id', allowanceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
