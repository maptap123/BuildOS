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
  if (!note?.trim()) {
    return NextResponse.json({ error: 'Missing required field: note' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('lead_activities')
    .insert({ lead_id: id, note: note.trim(), created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
