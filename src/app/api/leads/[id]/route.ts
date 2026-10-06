import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canView = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_view')
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const [{ data: lead, error: leadErr }, { data: activities }] = await Promise.all([
    admin.from('leads').select('*').eq('id', id).single(),
    admin
      .from('lead_activities')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  return NextResponse.json({ ...lead, activities: activities ?? [] })
}

const EDITABLE = [
  'title', 'client_name', 'client_email', 'client_phone', 'source', 'status',
  'estimated_value', 'notes', 'address', 'assigned_to',
] as const
const STATUSES = ['new', 'contacted', 'proposal', 'won', 'lost']
const STATUS_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', proposal: 'Proposal', won: 'Won', lost: 'Lost',
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canEdit = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_edit')
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  // Only lead fields a person may edit — never id, created_by, converted_job_id.
  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (!(key in body)) continue
    const value = body[key]
    if (key === 'estimated_value') {
      updates[key] = value == null || value === '' ? null : Number(value)
    } else if (typeof value === 'string') {
      updates[key] = value.trim() || (key === 'title' ? value : null)
    } else {
      updates[key] = value ?? null
    }
  }
  if ('title' in updates && !String(updates.title ?? '').trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if ('status' in updates && !STATUSES.includes(String(updates.status))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: before } = await admin.from('leads').select('status').eq('id', id).single()
  if (!before) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data, error } = await admin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let activity = null
  if (updates.status && updates.status !== before.status) {
    const { data: act } = await admin
      .from('lead_activities')
      .insert({
        lead_id: id,
        kind: 'status',
        note: `Status changed from ${STATUS_LABELS[before.status]} to ${STATUS_LABELS[String(updates.status)]}`,
        created_by: user.id,
      })
      .select()
      .single()
    activity = act
  }

  return NextResponse.json({ ...data, activity })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canDelete = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_delete')
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // The attachment rows cascade with the lead, but the stored files don't —
  // remove those first so nothing is orphaned in the bucket.
  const { data: files } = await admin.from('lead_attachments').select('storage_path').eq('lead_id', id)
  if (files?.length) {
    await admin.storage.from('lead-files').remove(files.map(f => f.storage_path))
  }

  // Estimates and activity cascade; a converted job keeps existing (lead_id → null).
  const { error } = await admin.from('leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // "New lead" alerts would otherwise link to a page that no longer exists.
  await admin.from('notifications').delete().eq('link', `/leads/${id}`)

  return NextResponse.json({ success: true })
}
