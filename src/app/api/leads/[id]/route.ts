import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates = await request.json()

  // Sanitise string fields
  if (updates.title)        updates.title        = updates.title.trim()
  if (updates.client_name)  updates.client_name  = updates.client_name.trim()
  if (updates.client_email) updates.client_email = updates.client_email.trim()
  if (updates.client_phone) updates.client_phone = updates.client_phone.trim()
  if (updates.address)      updates.address      = updates.address.trim()
  if (updates.notes)        updates.notes        = updates.notes.trim()
  if (updates.estimated_value != null) {
    updates.estimated_value = Number(updates.estimated_value)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
