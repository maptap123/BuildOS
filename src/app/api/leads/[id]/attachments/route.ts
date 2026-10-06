import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'

// Lead attachments live in the private `lead-files` bucket. Uploads go browser →
// storage on a one-time signed URL (so phone photos don't hit Vercel's request
// body limit), then the browser registers the file here.

type Params = { params: Promise<{ id: string }> }

const BUCKET = 'lead-files'
const MAX_BYTES = 50 * 1024 * 1024

async function authorize(action: 'can_view' | 'can_edit') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  if (!(await hasModulePermOrAdmin(admin, user.id, 'leads', action))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, admin }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const auth = await authorize('can_view')
  if (auth.error) return auth.error
  const { admin } = auth

  const { data: rows, error } = await admin
    .from('lead_attachments')
    .select('id, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json([])

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(rows.map(r => r.storage_path), 60 * 60)
  const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))

  return NextResponse.json(rows.map(r => ({ ...r, url: urlByPath.get(r.storage_path) ?? null })))
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await authorize('can_edit')
  if (auth.error) return auth.error
  const { user, admin } = auth

  const body = await request.json()
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 200) : ''
  if (!fileName) return NextResponse.json({ error: 'Missing file name' }, { status: 400 })

  // Step 1: hand back a one-time upload URL for a fresh path under this lead.
  if (body.step === 'sign') {
    if (Number(body.size_bytes) > MAX_BYTES) {
      return NextResponse.json({ error: `${fileName} is over the 50 MB limit` }, { status: 400 })
    }
    const { data: lead } = await admin.from('leads').select('id').eq('id', id).single()
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const safeName = fileName.replace(/[^\w.\- ]+/g, '_')
    const path = `${id}/${Date.now()}-${safeName}`
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload failed' }, { status: 500 })
    return NextResponse.json({ path: data.path, token: data.token })
  }

  // Step 2: the browser finished uploading — record it.
  const path = typeof body.path === 'string' ? body.path : ''
  if (!path.startsWith(`${id}/`)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  const { data, error } = await admin
    .from('lead_attachments')
    .insert({
      lead_id: id,
      file_name: fileName,
      storage_path: path,
      mime_type: typeof body.mime_type === 'string' ? body.mime_type : null,
      size_bytes: Number.isFinite(Number(body.size_bytes)) ? Number(body.size_bytes) : null,
      uploaded_by: user.id,
    })
    .select('id, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return NextResponse.json({ ...data, url: signed?.signedUrl ?? null }, { status: 201 })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  const auth = await authorize('can_edit')
  if (auth.error) return auth.error
  const { admin } = auth

  const attachmentId = new URL(request.url).searchParams.get('attachmentId')
  if (!attachmentId) return NextResponse.json({ error: 'Missing attachmentId' }, { status: 400 })

  const { data: row } = await admin
    .from('lead_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('lead_id', id)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await admin.from('lead_attachments').delete().eq('id', attachmentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
