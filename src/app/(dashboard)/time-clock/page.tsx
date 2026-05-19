import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TimeClockClient } from '@/components/time-clock/TimeClockClient'

export default async function TimeClockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [{ data: myEntries }, { data: activeJobs }, { data: myUser }] = await Promise.all([
    // Today's time entries for this user
    admin
      .from('time_entries')
      .select('*, job:jobs(id, name)')
      .eq('user_id', user.id)
      .gte('clock_in', todayISO)
      .order('clock_in', { ascending: false }),
    // Active jobs the crew can clock into
    admin
      .from('jobs')
      .select('id, name, job_number, status')
      .in('status', ['active', 'presale'])
      .order('name', { ascending: true }),
    // User's profile for rate display
    admin
      .from('users')
      .select('id, full_name, hourly_rate, overtime_rate')
      .eq('id', user.id)
      .single(),
  ])

  // Check if admin (admins can see shift management link)
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  return (
    <TimeClockClient
      currentUserId={user.id}
      currentUser={myUser ?? null}
      initialEntries={myEntries ?? []}
      activeJobs={activeJobs ?? []}
      isAdmin={!!perm?.can_manage}
    />
  )
}
