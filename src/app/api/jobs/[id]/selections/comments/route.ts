import { NextResponse } from 'next/server'
import { requireSelectionsPerm } from '@/lib/selections/auth'
import { COMMENT_COLUMNS } from '@/lib/selections/share'

type Params = { params: Promise<{ id: string }> }

/** GET — the job's comment thread. ?markRead=1 marks client comments as read by staff. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_view')
  if (auth instanceof NextResponse) return auth
  const { admin } = auth
  const markRead = new URL(request.url).searchParams.get('markRead') === '1'

  if (markRead) {
    await admin.from('selection_comments').update({ staff_read_at: new Date().toISOString() })
      .eq('job_id', id).eq('author_type', 'client').is('staff_read_at', null)
  }
  const { data } = await admin.from('selection_comments')
    .select(`${COMMENT_COLUMNS}, staff_read_at`).eq('job_id', id).order('created_at')
  const comments = data ?? []
  const unread = comments.filter(c => c.author_type === 'client' && !c.staff_read_at).length
  return NextResponse.json({ comments, unread })
}

/** POST — a staff reply on the thread. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireSelectionsPerm('can_view')
  if (auth instanceof NextResponse) return auth
  const { admin, user } = auth

  const body = await request.json().catch(() => ({}))
  const text = String(body.body ?? '').trim().slice(0, 4000)
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })

  let selectionId: string | null = null
  if (body.selection_id) {
    const { data: s } = await admin.from('selections').select('id').eq('id', body.selection_id).eq('job_id', id).maybeSingle()
    selectionId = s?.id ?? null
  }
  const { data: profile } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()

  const { data, error } = await admin.from('selection_comments').insert({
    job_id: id, selection_id: selectionId, author_type: 'staff',
    author_name: profile?.full_name || 'JDC Construction', author_user_id: user.id, body: text,
  }).select(COMMENT_COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
