import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShiftsClient } from '@/components/time-clock/ShiftsClient'

export default async function ShiftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Only admins/managers can access shift management
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!perm?.can_manage) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4">
          You don&apos;t have permission to manage shifts.
        </div>
      </div>
    )
  }

  // Last 30 days of all shifts with user + job info
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const [{ data: entries }, { data: users }, { data: jobs }] = await Promise.all([
    admin
      .from('time_entries')
      .select(
        '*, user:users(id, full_name, avatar_url, hourly_rate), job:jobs(id, name, job_number)',
      )
      .gte('clock_in', cutoff.toISOString())
      .order('clock_in', { ascending: false }),

    admin
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),

    admin
      .from('jobs')
      .select('id, name, job_number')
      .in('status', ['active', 'presale', 'closed'])
      .order('name', { ascending: true }),
  ])

  return (
    <ShiftsClient
      initialEntries={entries ?? []}
      users={users ?? []}
      jobs={jobs ?? []}
    />
  )
}
