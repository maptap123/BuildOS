import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScheduleClient } from '@/components/schedule'

export default async function JobSchedulePage({
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
    .eq('module', 'schedule')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view schedule data.
      </div>
    )
  }

  const [{ data: job }, { data: items }, { data: outlookIntegration }] = await Promise.all([
    admin.from('jobs').select('id').eq('id', id).single(),
    admin
      .from('schedule_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order')
      .order('start_date'),
    admin
      .from('integration_settings')
      .select('is_connected')
      .eq('service', 'outlook')
      .single(),
  ])

  if (!job) notFound()

  return (
    <ScheduleClient
      jobId={id}
      initialItems={items ?? []}
      permissions={{
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
      }}
      outlookConnected={outlookIntegration?.is_connected ?? false}
    />
  )
}
