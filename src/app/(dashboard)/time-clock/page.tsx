import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TimeClockClient } from '@/components/time-clock/TimeClockClient'

export default async function TimeClockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Last 8 days covers today + this week in any timezone. The browser decides
  // which of these are "today" / "this week" — the server runs in UTC, where
  // midnight is 8pm Eastern. Open shifts are always included, whatever day they
  // started, so a shift left running overnight can still be closed.
  const recentFrom = new Date(Date.now() - 8 * 24 * 3600_000).toISOString()

  const [
    { data: myEntries },
    { data: activeJobs },
    { data: myUser },
    { data: adminPerm },
    { data: timePerm },
  ] = await Promise.all([
    // Recent entries for this user, plus any open shift
    admin
      .from('time_entries')
      .select('*, job:jobs(id, name)')
      .eq('user_id', user.id)
      .or(`clock_in.gte.${recentFrom},clock_out.is.null`)
      .order('clock_in', { ascending: false }),

    // Active / presale jobs crew can clock into
    admin
      .from('jobs')
      .select('id, name, job_number, status, client_name')
      .in('status', ['active', 'presale'])
      .order('name', { ascending: true }),

    // User profile for name + rate display
    admin
      .from('users')
      .select('id, full_name, hourly_rate, overtime_rate')
      .eq('id', user.id)
      .single(),

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

  return (
    <TimeClockClient
      currentUserId={user.id}
      currentUser={myUser ?? null}
      initialEntries={myEntries ?? []}
      activeJobs={activeJobs ?? []}
      isAdmin={isAdmin}
    />
  )
}
