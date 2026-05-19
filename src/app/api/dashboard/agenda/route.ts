import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { AgendaPayload, AgendaTask, AgendaScheduleItem, AgendaLogEntry } from '@/types'

const PHOTO_BUCKET = 'job-photos'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perms } = await admin
    .from('user_permissions')
    .select('module, can_view')
    .eq('user_id', user.id)
    .in('module', ['tasks', 'schedule', 'logs'])

  const canView = new Set(
    (perms ?? []).filter(p => p.can_view).map(p => p.module)
  )

  const missing_perms: AgendaPayload['missing_perms'] = []
  if (!canView.has('tasks'))    missing_perms.push('tasks')
  if (!canView.has('schedule')) missing_perms.push('schedule')
  if (!canView.has('logs'))     missing_perms.push('logs')

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)

  const [pastDueRes, dueTodayRes, thisWeekRes, activityRes] = await Promise.all([
    // All overdue tasks across all active jobs (not filtered to current user)
    canView.has('tasks')
      ? admin
          .from('tasks')
          .select('id, job_id, title, priority, due_date, status, jobs!inner(name, status)')
          .not('status', 'in', '("done","archived")')
          .not('jobs.status', 'in', '("archived","closed")')
          .lt('due_date', today)
          .order('due_date', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: null, error: null }),

    // All tasks due today across all active jobs
    canView.has('tasks')
      ? admin
          .from('tasks')
          .select('id, job_id, title, priority, due_date, status, jobs!inner(name, status)')
          .not('status', 'in', '("done","archived")')
          .not('jobs.status', 'in', '("archived","closed")')
          .eq('due_date', today)
          .order('priority', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: null, error: null }),

    // All schedule items this week across all active jobs
    canView.has('schedule')
      ? admin
          .from('schedule_items')
          .select('id, job_id, title, start_date, end_date, status, jobs!inner(name, status)')
          .neq('status', 'completed')
          .not('jobs.status', 'in', '("archived","closed")')
          .lte('start_date', weekEndStr)
          .gte('end_date', weekStartStr)
          .order('start_date', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: null, error: null }),

    // Recent team activity — all users, active jobs only
    canView.has('logs')
      ? admin
          .from('daily_logs')
          .select('id, job_id, bt_log_id, log_date, author_name, work_performed, weather_summary, manpower_count, jobs!inner(name, status)')
          .not('jobs.status', 'in', '("archived")')
          .order('log_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
  ])

  type JoinedJob = { name: string; status: string } | null

  const past_due: AgendaTask[] = (pastDueRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    job_id: r.job_id as string,
    job_name: (r.jobs as JoinedJob)?.name ?? '',
    title: r.title as string,
    priority: r.priority as AgendaTask['priority'],
    due_date: r.due_date as string,
    status: r.status as AgendaTask['status'],
  }))

  const due_today: AgendaTask[] = (dueTodayRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    job_id: r.job_id as string,
    job_name: (r.jobs as JoinedJob)?.name ?? '',
    title: r.title as string,
    priority: r.priority as AgendaTask['priority'],
    due_date: r.due_date as string,
    status: r.status as AgendaTask['status'],
  }))

  const this_week: AgendaScheduleItem[] = (thisWeekRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    job_id: r.job_id as string,
    job_name: (r.jobs as JoinedJob)?.name ?? '',
    title: r.title as string,
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    status: r.status as AgendaScheduleItem['status'],
  }))

  const activityRows = (activityRes.data ?? []) as Record<string, unknown>[]
  const logIds = activityRows.map(r => r.id as string)
  const btLogIds = activityRows.map(r => r.bt_log_id as string | null).filter(Boolean) as string[]

  let photosByLog = new Map<string, AgendaLogEntry['photos']>()
  if (canView.has('logs') && (logIds.length > 0 || btLogIds.length > 0)) {
    const photoParts = []
    if (logIds.length > 0) photoParts.push(`log_id.in.(${logIds.join(',')})`)
    if (btLogIds.length > 0) photoParts.push(`bt_log_id.in.(${btLogIds.join(',')})`)

    const { data: photoRows } = await admin
      .from('log_photos')
      .select('id, log_id, bt_log_id, file_name, storage_path, caption')
      .or(photoParts.join(','))
      .order('created_at', { ascending: false })
      .limit(80)

    const logIdByBtLogId = new Map<string, string>()
    for (const row of activityRows) {
      if (row.bt_log_id) logIdByBtLogId.set(row.bt_log_id as string, row.id as string)
    }

    photosByLog = (photoRows ?? []).reduce((map, photo) => {
      const logId = photo.log_id ?? (photo.bt_log_id ? logIdByBtLogId.get(photo.bt_log_id) : undefined)
      if (!logId) return map

      const existing = map.get(logId) ?? []
      if (existing.length >= 4) return map

      let url: string | null = null
      if (photo.storage_path) {
        const { data: urlData } = admin.storage.from(PHOTO_BUCKET).getPublicUrl(photo.storage_path)
        url = urlData.publicUrl
      }

      existing.push({
        id: photo.id,
        file_name: photo.file_name,
        caption: photo.caption,
        url,
      })
      map.set(logId, existing)
      return map
    }, new Map<string, AgendaLogEntry['photos']>())
  }

  const team_activity: AgendaLogEntry[] = activityRows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    job_id: r.job_id as string,
    job_name: (r.jobs as JoinedJob)?.name ?? '',
    log_date: r.log_date as string,
    bt_log_id: r.bt_log_id as string | null,
    author_name: r.author_name as string | null,
    work_performed: r.work_performed
      ? (r.work_performed as string).slice(0, 220)
      : null,
    weather_summary: r.weather_summary as string | null,
    manpower_count: r.manpower_count as number | null,
    photos: photosByLog.get(r.id as string) ?? [],
  }))

  const payload: AgendaPayload = { past_due, due_today, this_week, team_activity, missing_perms }
  return NextResponse.json(payload)
}
