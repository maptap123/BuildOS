import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LogsSummaryClient } from '@/components/logs'
import type { LogSummaryRow, LogPhotoRef } from '@/components/logs'

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
      .select('id, job_id, bt_log_id, log_date, author_name, weather_summary, temperature_high, manpower_count, work_performed, delays, safety_notes, job:jobs!inner(id, name, job_number, status)')
      .gte('log_date', sinceStr)
      .order('log_date', { ascending: false })
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    logs.push(...((data ?? []) as unknown as LogSummaryRow[]))
    if (!data || data.length < PAGE) break
  }

  // Photos: direct uploads (log_id) and Buildertrend imports (bt_log_id)
  const CHUNK = 100
  const btToLog = new Map<string, string>()
  for (const l of logs) if (l.bt_log_id) btToLog.set(l.bt_log_id, l.id)
  const photosByLog = new Map<string, LogPhotoRef[]>()
  const seen = new Set<string>()
  const addPhotos = (rows: Array<Record<string, unknown>> | null) => {
    for (const p of rows ?? []) {
      const id = p.id as string
      if (seen.has(id) || !p.storage_path) continue
      seen.add(id)
      const logId = (p.log_id as string | null) ?? btToLog.get(p.bt_log_id as string)
      if (!logId) continue
      const { data: u } = admin.storage.from('job-photos').getPublicUrl(p.storage_path as string)
      const arr = photosByLog.get(logId) ?? []
      arr.push({ id, url: u.publicUrl, file_name: (p.file_name as string | null) ?? null })
      photosByLog.set(logId, arr)
    }
  }
  const cols = 'id, log_id, bt_log_id, file_name, storage_path, created_at'
  const logIds = logs.map(l => l.id)
  const btIds = [...btToLog.keys()]
  for (let i = 0; i < logIds.length; i += CHUNK) {
    const { data } = await admin.from('log_photos').select(cols).in('log_id', logIds.slice(i, i + CHUNK)).order('created_at').limit(1000)
    addPhotos(data)
  }
  for (let i = 0; i < btIds.length; i += CHUNK) {
    const { data } = await admin.from('log_photos').select(cols).in('bt_log_id', btIds.slice(i, i + CHUNK)).order('created_at').limit(1000)
    addPhotos(data)
  }
  for (const l of logs) l.photos = photosByLog.get(l.id) ?? []

  const { data: activeJobs } = await admin
    .from('jobs')
    .select('id, name, job_number')
    .eq('status', 'active')
    .order('name')

  return <LogsSummaryClient logs={logs} activeJobs={activeJobs ?? []} />
}
