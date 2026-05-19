import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'tasks')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase.from('tasks').select('*').order('due_date', { nullsFirst: false }).order('created_at')
  if (jobId) query = query.eq('job_id', jobId)

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
    .eq('module', 'tasks')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    job_id, title, description,
    status = 'todo', priority = 'medium',
    due_date, estimated_hours, actual_hours, tags = [], schedule_item_id,
  } = body
  if (!job_id || !title?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tasks')
    .insert({
      job_id,
      title: title.trim(),
      description: description?.trim() || null,
      status,
      priority,
      due_date: due_date || null,
      estimated_hours: estimated_hours ?? null,
      actual_hours: actual_hours ?? null,
      tags: Array.isArray(tags) ? tags : [],
      schedule_item_id: schedule_item_id ?? null,
      created_by: user.id,
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
    .eq('module', 'tasks')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, ...rawUpdates } = body
  if (!id) return NextResponse.json({ error: 'Missing task id' }, { status: 400 })

  const allowedKeys = [
    'title', 'description', 'status', 'priority', 'due_date',
    'assigned_to', 'estimated_hours', 'actual_hours', 'tags', 'schedule_item_id',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in rawUpdates) updates[key] = rawUpdates[key]
  }

  if (updates.status === 'done') {
    updates.completed_at = new Date().toISOString()
    updates.completed_by = user.id
  } else if (updates.status && updates.status !== 'done') {
    updates.completed_at = null
    updates.completed_by = null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tasks')
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
    .eq('module', 'tasks')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
