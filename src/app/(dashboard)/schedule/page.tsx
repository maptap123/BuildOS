import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScheduleSummaryClient } from '@/components/schedule'
import type { ScheduleSummaryItem } from '@/components/schedule'

export const metadata = { title: 'Schedule — BuildOS' }

// Window loaded for the all-jobs summary. The client filters inside it: the
// longest forward range is 30 days, past due looks back 30.
const LOOKBACK_DAYS = 31
const LOOKAHEAD_DAYS = 31
const PAGE = 1000

function isoDaysFromNow(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Cross-job schedule — where Schedule opens when no job is selected.
export default async function ScheduleSummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
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

  const from = isoDaysFromNow(-LOOKBACK_DAYS)
  const to = isoDaysFromNow(LOOKAHEAD_DAYS)

  // Paged so a busy month never gets silently cut at PostgREST's row cap
  const items: ScheduleSummaryItem[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('schedule_items')
      .select('id, job_id, title, status, type, start_date, end_date, percent_complete, trade, color, job:jobs!inner(id, name, job_number, status)')
      .lte('start_date', to)
      .gte('end_date', from)
      .in('jobs.status', ['active', 'presale', 'warranty'])
      .order('start_date')
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    items.push(...((data ?? []) as unknown as ScheduleSummaryItem[]))
    if (!data || data.length < PAGE) break
  }

  return <ScheduleSummaryClient items={items} />
}
