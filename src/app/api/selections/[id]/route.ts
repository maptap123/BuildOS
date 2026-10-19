import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { reconcileAllowanceOverage } from '@/lib/selections/overage'
import type { SelectionStatus } from '@/types'

type Params = { params: Promise<{ id: string }> }

const STATUSES: SelectionStatus[] = ['pending', 'selected', 'ordered', 'installed']

/** PATCH — edit a selection: title, location, instructions, status, or which allowance it draws on. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_edit')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: current } = await admin.from('selections').select('id, job_id, allowance_id').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    patch.title = title
  }
  if ('location' in body) patch.location = String(body.location ?? '').trim() || null
  if ('instructions' in body) patch.instructions = String(body.instructions ?? '').trim() || null
  if ('deadline' in body) patch.deadline = body.deadline || null
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    patch.status = body.status
  }
  if ('allowance_id' in body) {
    if (body.allowance_id) {
      const { data: a } = await admin
        .from('allowances').select('id').eq('id', body.allowance_id).eq('job_id', current.job_id).single()
      if (!a) return NextResponse.json({ error: 'That allowance is not on this job' }, { status: 400 })
    }
    patch.allowance_id = body.allowance_id || null
  }

  const { data, error } = await admin.from('selections').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Moving a picked selection between allowances moves its spend — both sides re-bill.
  if ('allowance_id' in patch && patch.allowance_id !== current.allowance_id) {
    await reconcileAllowanceOverage(admin, current.allowance_id, user.id)
    await reconcileAllowanceOverage(admin, data.allowance_id, user.id)
  }

  return NextResponse.json(data)
}

/** DELETE — removes the selection and its choices; its allowance's overage is re-worked. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_delete')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const { data: current } = await admin.from('selections').select('allowance_id').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  const { error } = await admin.from('selections').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await reconcileAllowanceOverage(admin, current.allowance_id, user.id)
  return NextResponse.json({ ok: true })
}
