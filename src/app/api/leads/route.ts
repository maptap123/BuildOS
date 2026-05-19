import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
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

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 })

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

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
