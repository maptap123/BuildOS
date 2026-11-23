import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMMENT_COLUMNS, jobIdForShareToken } from '@/lib/selections/share'

type Params = { params: Promise<{ token: string }> }

/** Public (token-authenticated): read the thread. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()
  const jobId = await jobIdForShareToken(admin, token)
  if (!jobId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await admin.from('selection_comments').select(COMMENT_COLUMNS).eq('job_id', jobId).order('created_at')
  return NextResponse.json({ comments: data ?? [] })
}

/** Public (token-authenticated): post a comment as the client. */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()
  const jobId = await jobIdForShareToken(admin, token)
  if (!jobId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const text = String(body.body ?? '').trim().slice(0, 2000)
  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })

  // Crude flood guard: cap how fast one thread can grow.
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin.from('selection_comments').select('id', { count: 'exact', head: true })
    .eq('job_id', jobId).eq('author_type', 'client').gte('created_at', since)
  if ((count ?? 0) >= 10) return NextResponse.json({ error: 'Too many messages, try again in a minute' }, { status: 429 })

  let selectionId: string | null = null
  if (body.selection_id) {
    const { data: s } = await admin.from('selections').select('id').eq('id', body.selection_id).eq('job_id', jobId).maybeSingle()
    selectionId = s?.id ?? null
  }
  const { data, error } = await admin.from('selection_comments').insert({
    job_id: jobId, selection_id: selectionId, author_type: 'client', author_name: name, body: text,
  }).select(COMMENT_COLUMNS).single()
  if (error) return NextResponse.json({ error: 'Could not send' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
