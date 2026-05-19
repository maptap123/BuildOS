import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TaskClient } from '@/components/tasks'

export default async function JobTasksPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('user_id', user.id)
    .eq('module', 'tasks')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view tasks.
      </div>
    )
  }

  const [{ data: job }, { data: tasks }] = await Promise.all([
    admin
      .from('jobs')
      .select('id')
      .eq('id', id)
      .single(),
    admin
      .from('tasks')
      .select('*')
      .eq('job_id', id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ])

  if (!job) notFound()

  return (
    <TaskClient
      jobId={id}
      currentUserId={user.id}
      initialTasks={tasks ?? []}
      permissions={{
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
