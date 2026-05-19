import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'job-photos'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('log_photos')
    .select('id, log_id, job_id, bt_photo_id, bt_log_id, file_name, storage_path, caption, taken_at, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach public URLs
  const photos = (data ?? []).map(p => {
    let url: string | null = null
    if (p.storage_path) {
      const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(p.storage_path)
      url = urlData.publicUrl
    }
    return { ...p, url }
  })

  return NextResponse.json(photos)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await request.formData()
  const jobId  = form.get('job_id') as string | null
  const logId  = form.get('log_id') as string | null
  const file   = form.get('file') as File | null

  if (!jobId || !file) return NextResponse.json({ error: 'job_id and file required' }, { status: 400 })

  const storagePath = logId
    ? `${jobId}/${logId}/${Date.now()}-${file.name}`
    : `${jobId}/${Date.now()}-${file.name}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType: file.type || 'image/jpeg', upsert: false })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath)

  const { data, error } = await admin
    .from('log_photos')
    .insert({
      job_id: jobId,
      log_id: logId || null,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, url: urlData.publicUrl }, { status: 201 })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: photo } = await admin.from('log_photos').select('storage_path').eq('id', id).single()
  if (photo?.storage_path) {
    await admin.storage.from(BUCKET).remove([photo.storage_path])
  }

  const { error } = await admin.from('log_photos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
