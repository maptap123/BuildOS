import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LogClient } from '@/components/logs'

export default async function JobLogsPage({
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
    .eq('module', 'logs')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view daily logs.
      </div>
    )
  }

  const [{ data: job }, { data: logs }] = await Promise.all([
    admin
      .from('jobs')
      .select('id')
      .eq('id', id)
      .single(),
    admin
      .from('daily_logs')
      .select('*')
      .eq('job_id', id)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!job) notFound()

  return (
    <LogClient
      jobId={id}
      initialLogs={logs ?? []}
      permissions={{
        can_create: perm.can_create,
        can_edit:   perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
