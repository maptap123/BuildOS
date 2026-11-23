import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'

type Params = { params: Promise<{ id: string }> }

/** POST — the job's public share token, created on first use. { regenerate: true } replaces it (old link dies). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_edit')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth
  const body = await request.json().catch(() => ({}))

  if (body.regenerate) {
    await admin.from('selection_share_links').delete().eq('job_id', id)
  }
  let { data } = await admin.from('selection_share_links').select('token').eq('job_id', id).maybeSingle()
  if (!data) {
    const { data: created, error } = await admin
      .from('selection_share_links')
      .insert({ job_id: id, created_by: user.id })
      .select('token')
      .single()
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Could not create link' }, { status: 500 })
    data = created
  }
  return NextResponse.json({ token: data.token })
}
