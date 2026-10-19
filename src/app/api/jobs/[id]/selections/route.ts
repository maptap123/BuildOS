import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { loadSelectionsBoard } from '@/lib/selections/board'

type Params = { params: Promise<{ id: string }> }

/** GET — the job's selections board (syncs the estimate's allowances first). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_view')
  if (auth instanceof NextResponse) return auth

  const board = await loadSelectionsBoard(auth.admin, id, auth.user.id)
  return NextResponse.json(board)
}

/**
 * POST — a new selection. The client asked what to do about money after the cost code
 * was picked, and `allowance` carries the answer:
 *   { mode: 'link', allowance_id }                 draw from an existing allowance
 *   { mode: 'new', amount, estimate_line_id? }     add an allowance (internal only)
 *   { mode: 'change_order' }                       not in the contract: the whole price is
 *                                                  an add — a $0 allowance, so any pick
 *                                                  drafts a change order for its full price
 *   { mode: 'none' }                               a decision with no money (paint color)
 */
export async function POST(request: Request, { params }: Params) {
  const { id: jobId } = await params
  const auth = await requireSelectionsPerm('can_create')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const body = await request.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const costCode = String(body.cost_code ?? '').trim() || null
  const allowance = body.allowance ?? { mode: 'none' }

  let allowanceId: string | null = null

  if (allowance.mode === 'link') {
    const { data: a } = await admin
      .from('allowances')
      .select('id')
      .eq('id', allowance.allowance_id)
      .eq('job_id', jobId)
      .single()
    if (!a) return NextResponse.json({ error: 'That allowance is not on this job' }, { status: 400 })
    allowanceId = a.id
  } else if (allowance.mode === 'new' || allowance.mode === 'change_order') {
    const amount = allowance.mode === 'new' ? Number(allowance.amount) : 0
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'Allowance amount must be a positive number' }, { status: 400 })
    }
    const { data: created, error } = await admin
      .from('allowances')
      .insert({
        job_id: jobId,
        title: String(allowance.title ?? '').trim() || title,
        cost_code: costCode,
        amount,
        source: 'manual',
        estimate_line_id: allowance.mode === 'new' ? allowance.estimate_line_id ?? null : null,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That estimate line already has an allowance — link to it instead' }, { status: 409 })
    }
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Could not add allowance' }, { status: 500 })
    allowanceId = created.id
  }

  const { data: selection, error } = await admin
    .from('selections')
    .insert({
      job_id: jobId,
      allowance_id: allowanceId,
      title,
      cost_code: costCode,
      location: String(body.location ?? '').trim() || null,
      instructions: String(body.instructions ?? '').trim() || null,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(selection, { status: 201 })
}
