import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// 'status' entries are written by the lead PATCH, never posted directly.
const LOGGABLE_KINDS = ['note', 'call', 'text', 'email', 'meeting']

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canView = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_view')
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('lead_activities')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canCreate = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_create')
  if (!canCreate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { note } = body
  const kind = LOGGABLE_KINDS.includes(body.kind) ? body.kind : 'note'
  if (!note?.trim()) {
    return NextResponse.json({ error: 'Missing required field: note' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('lead_activities')
    .insert({ lead_id: id, kind, note: note.trim(), created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activityId = new URL(request.url).searchParams.get('activityId')
  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: act } = await admin
    .from('lead_activities')
    .select('created_by')
    .eq('id', activityId)
    .eq('lead_id', id)
    .single()
  if (!act) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Your own entries are yours to remove; anyone else's needs lead delete rights.
  if (act.created_by !== user.id) {
    const canDelete = await hasModulePermOrAdmin(admin, user.id, 'leads', 'can_delete')
    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin.from('lead_activities').delete().eq('id', activityId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
