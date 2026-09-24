import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LogsSummaryClient } from '@/components/logs'
import type { LogSummaryRow } from '@/components/logs'

export const metadata = { title: 'Daily Logs — BuildOS' }

// The longest range the summary offers
const LOOKBACK_DAYS = 90
const PAGE = 1000

// Cross-job daily logs — where Logs opens when no job is selected.
export default async function LogsSummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
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

  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)
  const sinceStr = since.toISOString().slice(0, 10)

  const logs: LogSummaryRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('daily_logs')
      .select('id, job_id, log_date, author_name, weather_summary, temperature_high, manpower_count, work_performed, delays, safety_notes, job:jobs!inner(id, name, job_number, status)')
      .gte('log_date', sinceStr)
      .order('log_date', { ascending: false })
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    logs.push(...((data ?? []) as unknown as LogSummaryRow[]))
    if (!data || data.length < PAGE) break
  }

  const { data: activeJobs } = await admin
    .from('jobs')
    .select('id, name, job_number')
    .eq('status', 'active')
    .order('name')

  return <LogsSummaryClient logs={logs} activeJobs={activeJobs ?? []} />
}
