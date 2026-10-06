import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getAdminUserIds } from '@/lib/notifications'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canView = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_view')
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canCreate = await hasModulePermOrAdmin(createAdminClient(), user.id, 'leads', 'can_create')
  if (!canCreate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    title,
    client_name,
    client_email,
    client_phone,
    source,
    status,
    estimated_value,
    notes,
    address,
    assigned_to,
  } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .insert({
      title: title.trim(),
      client_name:     client_name?.trim()  || null,
      client_email:    client_email?.trim() || null,
      client_phone:    client_phone?.trim() || null,
      source:          source                || null,
      status:          status                || 'new',
      estimated_value: estimated_value != null ? Number(estimated_value) : null,
      notes:           notes?.trim()         || null,
      address:         address?.trim()       || null,
      assigned_to:     assigned_to           || null,
      created_by:      user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const adminIds = (await getAdminUserIds(admin)).filter((id) => id !== user.id)
  await notify({
    admin,
    userIds: adminIds,
    type: 'lead_created',
    title: `New lead: ${data.title}`,
    body: data.client_name ? `From ${data.client_name}` : undefined,
    link: `/leads/${data.id}`,
  })

  return NextResponse.json(data, { status: 201 })
}
