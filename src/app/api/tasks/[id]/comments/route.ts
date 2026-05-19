import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'tasks')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('task_comments')
    .select('*, author:created_by(full_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params
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

  const { body: commentBody } = await request.json()
  if (!commentBody?.trim()) {
    return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
  }

  // Verify task exists and get job_id
  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('job_id')
    .eq('id', taskId)
    .single()

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const { data, error } = await admin
    .from('task_comments')
    .insert({
      task_id: taskId,
      job_id: task.job_id,
      body: commentBody.trim(),
      created_by: user.id,
    })
    .select('*, author:created_by(full_name, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const commentId = searchParams.get('comment_id')
  if (!commentId) return NextResponse.json({ error: 'comment_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Only allow deleting own comments (or admin)
  const { data: comment } = await admin
    .from('task_comments')
    .select('created_by')
    .eq('id', commentId)
    .eq('task_id', taskId)
    .single()

  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

  const { data: adminPerm } = await supabase
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (comment.created_by !== user.id && !adminPerm?.can_manage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin.from('task_comments').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
