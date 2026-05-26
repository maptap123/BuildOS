import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TimeClockClient } from '@/components/time-clock/TimeClockClient'

export default async function TimeClockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Today's start (for initial entry fetch)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  // Monday of this ISO week (for weekly total)
  const weekStart = new Date()
  const dayOfWeek = weekStart.getDay() // 0=Sun, 1=Mon, â€¦
  const daysFromMonday = (dayOfWeek + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysFromMonday)
  weekStart.setHours(0, 0, 0, 0)

  const [
    { data: myEntries },
    { data: activeJobs },
    { data: myUser },
    { data: weekEntries },
    { data: adminPerm },
    { data: timePerm },
  ] = await Promise.all([
    // Today's entries for this user (including active shift)
    admin
      .from('time_entries')
      .select('*, job:jobs(id, name)')
      .eq('user_id', user.id)
      .gte('clock_in', todayISO)
      .order('clock_in', { ascending: false }),

    // Active / presale jobs crew can clock into
    admin
      .from('jobs')
      .select('id, name, job_number, status')
      .in('status', ['active', 'presale'])
      .order('name', { ascending: true }),

    // User profile for name + rate display
    admin
      .from('users')
      .select('id, full_name, hourly_rate, overtime_rate')
      .eq('id', user.id)
      .single(),

    // This week's completed entries for the week total
    admin
      .from('time_entries')
      .select('regular_hours, overtime_hours')
      .eq('user_id', user.id)
      .gte('clock_in', weekStart.toISOString())
      .not('clock_out', 'is', null),

    // Admin check (for "Manage Shifts" link)
    admin
      .from('user_permissions')
      .select('can_manage')
      .eq('user_id', user.id)
      .eq('module', 'admin')
      .single(),

    // time_clock module permission
    admin
      .from('user_permissions')
      .select('can_view')
      .eq('user_id', user.id)
      .eq('module', 'time_clock')
      .single(),
  ])

  const isAdmin = !!adminPerm?.can_manage

  // Access check: allow if admin, or if no row exists (default allow for crew),
  // or if can_view is explicitly true. Block only if row exists AND can_view = false.
  const hasAccess = isAdmin || !timePerm || timePerm.can_view !== false
  if (!hasAccess) redirect('/jobs')

  // Week total hours (completed shifts only)
  const weekTotalHours = (weekEntries ?? []).reduce(
    (sum, e) => sum + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0),
    0,
  )

  return (
    <TimeClockClient
      currentUserId={user.id}
      currentUser={myUser ?? null}
      initialEntries={myEntries ?? []}
      activeJobs={activeJobs ?? []}
      isAdmin={isAdmin}
      weekTotalHours={Math.round(weekTotalHours * 100) / 100}
    />
  )
}
