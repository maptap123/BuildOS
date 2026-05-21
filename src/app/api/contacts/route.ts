import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase
    .from('contacts')
    .select('*, jobs(name)')
    .order('full_name', { ascending: true })

  if (jobId) query = query.eq('job_id', jobId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    job_id,
    full_name,
    email,
    phone,
    address,
    city,
    state,
    postal_code,
    is_primary,
    notes,
  } = body

  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contacts')
    .insert({
      job_id: job_id || null,
      full_name: full_name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      postal_code: postal_code?.trim() || null,
      is_primary: is_primary ?? false,
      notes: notes?.trim() || null,
      created_by: user.id,
    })
    .select('*, jobs(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 })

  if (updates.full_name !== undefined) {
    updates.full_name = updates.full_name?.trim() || null
    if (!updates.full_name) return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  }
  if (updates.email !== undefined) updates.email = updates.email?.trim() || null
  if (updates.phone !== undefined) updates.phone = updates.phone?.trim() || null
  if (updates.address !== undefined) updates.address = updates.address?.trim() || null
  if (updates.city !== undefined) updates.city = updates.city?.trim() || null
  if (updates.state !== undefined) updates.state = updates.state?.trim() || null
  if (updates.postal_code !== undefined) updates.postal_code = updates.postal_code?.trim() || null
  if (updates.notes !== undefined) updates.notes = updates.notes?.trim() || null
  if (updates.job_id !== undefined) updates.job_id = updates.job_id || null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select('*, jobs(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
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
  const { error } = await admin.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
