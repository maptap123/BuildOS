import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PayrollReportClient } from '@/components/time-clock/PayrollReportClient'

// Monday of the week before today, as YYYY-MM-DD (the report Evelyn sends each Monday)
function lastMonday(): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  const sinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - sinceMonday - 7)
  return d.toISOString().slice(0, 10)
}

export default async function PayrollReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
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
          You don&apos;t have permission to view the payroll report.
        </div>
      </div>
    )
  }

  const { start: rawStart } = await searchParams
  const start = rawStart && /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : lastMonday()

  // Fetch a padded window; the client trims to the exact local-time week so
  // timezone differences between server and browser can't drop a shift.
  const from = new Date(`${start}T12:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${start}T12:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 8)

  const { data: entries } = await admin
    .from('time_entries')
    .select(
      'id, user_id, clock_in, clock_out, regular_hours, overtime_hours, break_minutes, user:users!user_id(full_name), job:jobs!job_id(name)',
    )
    .gte('clock_in', from.toISOString())
    .lt('clock_in', to.toISOString())
    .order('clock_in', { ascending: true })
    .range(0, 4999)

  return <PayrollReportClient start={start} entries={(entries ?? []) as never} />
}
