import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Phone, Calendar, Users, Plus, FileText, CheckSquare, CalendarDays, DollarSign, AlertCircle, TrendingUp, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Job, DailyLog, Task, ScheduleItem, Contact } from '@/types'
import { CloseoutPanel } from '@/components/jobs/CloseoutPanel'
import { JobContactsPanel } from '@/components/jobs/JobContactsPanel'
import { ConnectedSystemsCard } from '@/components/jobs/ConnectedSystemsCard'

type JobDetail = Job & {
  pm: { full_name: string | null } | null
  super: { full_name: string | null } | null
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-gray-300', medium: 'bg-blue-400', high: 'bg-amber-400', urgent: 'bg-red-500',
}

const SCHEDULE_STATUS_COLOR: Record<string, string> = {
  not_started: 'text-gray-500',
  in_progress: 'text-blue-600',
  completed:   'text-green-600',
  blocked:     'text-red-600',
  delayed:     'text-amber-600',
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return d >= weekStart && d <= weekEnd
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: jobPerm } = await admin
    .from('user_permissions')
    .select('can_view, can_edit, can_create')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!jobPerm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view this job.
      </div>
    )
  }

  const { data } = await admin
    .from('jobs')
    .select('*, pm:project_manager_id(full_name), super:superintendent_id(full_name)')
    .eq('id', id)
    .single()

  if (!data) notFound()
  const job = data as unknown as JobDetail

  const [
    { data: budgetPerm },
    { data: tasksPerm },
    { data: logsPerm },
    { data: schedulePerm },
  ] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_create').eq('user_id', user.id).eq('module', 'budget').single(),
    admin.from('user_permissions').select('can_view, can_create').eq('user_id', user.id).eq('module', 'tasks').single(),
    admin.from('user_permissions').select('can_view, can_create').eq('user_id', user.id).eq('module', 'logs').single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'schedule').single(),
  ])

  const canSeeBudget     = budgetPerm?.can_view    ?? false
  const canSeeSchedule   = schedulePerm?.can_view  ?? false
  const canSeeTasks      = tasksPerm?.can_view     ?? false
  const canSeeLogs       = logsPerm?.can_view      ?? false
  const canCreateTask    = tasksPerm?.can_create   ?? false
  const canCreateLog     = logsPerm?.can_create    ?? false

  // Parallel data fetch for dashboard cards — only what user has permission to see
  const [logsResult, tasksResult, scheduleResult, budgetResult, contactsResult] = await Promise.all([
    canSeeLogs
      ? admin.from('daily_logs').select('id, log_date, work_performed, weather_summary, manpower_count').eq('job_id', id).order('log_date', { ascending: false }).limit(3)
      : Promise.resolve({ data: null }),
    canSeeTasks
      ? admin.from('tasks').select('id, title, status, priority, due_date').eq('job_id', id).in('status', ['todo','in_progress','blocked']).order('priority', { ascending: false }).limit(5)
      : Promise.resolve({ data: null }),
    canSeeSchedule
      ? admin.from('schedule_items').select('id, title, status, start_date, end_date, percent_complete').eq('job_id', id).order('start_date')
      : Promise.resolve({ data: null }),
    canSeeBudget
      ? admin.from('budget_lines').select('revised_budget, committed_cost, forecast_cost').eq('job_id', id)
      : Promise.resolve({ data: null }),
    admin.from('contacts').select('*').eq('job_id', id).order('is_primary', { ascending: false }).order('full_name'),
  ])

  const recentLogs    = (logsResult.data ?? []) as Pick<DailyLog, 'id' | 'log_date' | 'work_performed' | 'weather_summary' | 'manpower_count'>[]
  const openTasks     = (tasksResult.data ?? []) as Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'due_date'>[]
  const scheduleItems = (scheduleResult.data ?? []) as Pick<ScheduleItem, 'id' | 'title' | 'status' | 'start_date' | 'end_date' | 'percent_complete'>[]
  const budgetLines   = (budgetResult.data ?? []) as { revised_budget: number; committed_cost: number; forecast_cost: number | null }[]
  const jobContacts   = (contactsResult.data ?? []) as Contact[]

  const thisWeekItems = scheduleItems.filter(s =>
    isThisWeek(s.start_date) || isThisWeek(s.end_date) ||
    (new Date(s.start_date) <= new Date() && new Date(s.end_date) >= new Date())
  )

  const totalBudget    = budgetLines.reduce((s, l) => s + l.revised_budget, 0)
  const totalForecast  = budgetLines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
  const totalCommitted = budgetLines.reduce((s, l) => s + l.committed_cost, 0)
  const budgetVariance = totalBudget - totalForecast

  const addressParts = [job.site_address, job.city, job.state, job.postal_code].filter(Boolean)
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addressParts.join(', '))}`

  const isOverdue = (due: string | null) => {
    if (!due) return false
    return new Date(due + 'T23:59:59') < new Date()
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">

      {/* Card 1 — Job Info */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="font-display font-semibold text-navy-900 mb-4 text-base">Job Info</h3>
        <div className="space-y-3 text-sm">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 text-navy-700 hover:text-gold-600 transition-colors group"
          >
            <MapPin size={14} className="mt-0.5 text-gray-400 group-hover:text-gold-500 shrink-0" />
            <span className="leading-relaxed">
              {job.site_address}
              {(job.city || job.state || job.postal_code) && (
                <><br />{[job.city, job.state, job.postal_code].filter(Boolean).join(', ')}</>
              )}
            </span>
          </a>

          <div className="flex items-center gap-2.5">
            <Users size={14} className="text-gray-400 shrink-0" />
            <span className="text-navy-700">{job.client_name}</span>
          </div>
          {job.client_phone && (
            <a
              href={`tel:${job.client_phone}`}
              className="flex items-center gap-2.5 text-navy-700 hover:text-gold-600 transition-colors pl-[22px]"
            >
              <Phone size={13} className="text-gray-400 shrink-0" />
              {job.client_phone}
            </a>
          )}

          <div className="flex items-start gap-2.5 pt-2 border-t border-gray-100">
            <Calendar size={14} className="mt-0.5 text-gray-400 shrink-0" />
            <div className="space-y-0.5 text-gray-500">
              <p>Start: <span className="text-navy-700">{fmtDate(job.start_date)}</span></p>
              <p>Target: <span className="text-navy-700">{fmtDate(job.target_completion_date)}</span></p>
              {job.actual_completion_date && (
                <p>Completed: <span className="text-green-700">{fmtDate(job.actual_completion_date)}</span></p>
              )}
            </div>
          </div>

          {(job.pm?.full_name || job.super?.full_name) && (
            <div className="flex items-start gap-2.5 pt-2 border-t border-gray-100">
              <Users size={14} className="mt-0.5 text-gray-400 shrink-0" />
              <div className="space-y-0.5 text-gray-500">
                {job.pm?.full_name   && <p>PM: <span className="text-navy-700">{job.pm.full_name}</span></p>}
                {job.super?.full_name && <p>Super: <span className="text-navy-700">{job.super.full_name}</span></p>}
              </div>
            </div>
          )}

          {job.tags?.length > 0 && (
            <div className="flex items-start gap-2.5 pt-2 border-t border-gray-100">
              <Tag size={14} className="mt-0.5 text-gray-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {job.tags.map(tag => (
                  <span key={tag} className="rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {job.description && (
            <p className="text-gray-500 text-xs pt-2 border-t border-gray-100 leading-relaxed">{job.description}</p>
          )}
        </div>
      </div>

      {/* Card 2 — Recent Logs */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-navy-900 text-base">Recent Logs</h3>
          <div className="flex items-center gap-2">
            {canSeeLogs && recentLogs.length > 0 && (
              <Link href={`/jobs/${id}/logs`} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
                View all →
              </Link>
            )}
            {canCreateLog && (
              <Link
                href={`/jobs/${id}/logs`}
                className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                <Plus size={12} />
                Add Log
              </Link>
            )}
          </div>
        </div>
        {!canSeeLogs ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <FileText size={28} className="text-gray-200" />
            No access to logs
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <FileText size={28} className="text-gray-200" />
            No logs yet
          </div>
        ) : (
          <div className="space-y-3">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                <div className="shrink-0 bg-navy-50 rounded-lg px-2 py-1 text-center min-w-[44px]">
                  <p className="text-[10px] text-navy-400 font-medium uppercase">
                    {new Date(log.log_date).toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                  <p className="text-sm font-bold text-navy-800 leading-none">
                    {new Date(log.log_date).getDate()}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-navy-800 font-medium leading-snug line-clamp-2">{log.work_performed}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    {log.weather_summary && <span>{log.weather_summary}</span>}
                    {log.manpower_count != null && <span>· {log.manpower_count} workers</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 3 — Open Tasks */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-navy-900 text-base">
            Open Tasks
            {canSeeTasks && openTasks.length > 0 && (
              <span className="ml-2 text-xs font-sans font-normal text-gray-400">{openTasks.length}</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {canSeeTasks && openTasks.length > 0 && (
              <Link href={`/jobs/${id}/tasks`} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
                View all →
              </Link>
            )}
            {canCreateTask && (
              <Link
                href={`/jobs/${id}/tasks`}
                className="flex items-center gap-1.5 border border-gold-400 text-gold-600 hover:bg-gold-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} />
                Add Task
              </Link>
            )}
          </div>
        </div>
        {!canSeeTasks ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <CheckSquare size={28} className="text-gray-200" />
            No access to tasks
          </div>
        ) : openTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <CheckSquare size={28} className="text-gray-200" />
            No open tasks
          </div>
        ) : (
          <div className="space-y-2">
            {openTasks.map(task => {
              const overdue = isOverdue(task.due_date) && task.status !== 'done'
              return (
                <Link
                  key={task.id}
                  href={`/jobs/${id}/tasks`}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`} />
                  <span className="flex-1 text-sm text-navy-800 font-medium truncate">{task.title}</span>
                  {task.due_date && (
                    <span className={`text-xs shrink-0 ${overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                      {overdue && <AlertCircle size={11} className="inline mr-0.5 -mt-0.5" />}
                      {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Card 4 — Contacts */}
      <JobContactsPanel
        jobId={id}
        initialContacts={jobContacts}
        canCreate={jobPerm?.can_create ?? false}
      />

      {/* Card 5 — This Week's Schedule */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-navy-900 text-base">This Week</h3>
          {canSeeSchedule && scheduleItems.length > 0 && (
            <Link href={`/jobs/${id}/schedule`} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
              Full schedule →
            </Link>
          )}
        </div>
        {!canSeeSchedule ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <CalendarDays size={28} className="text-gray-200" />
            No access to schedule
          </div>
        ) : thisWeekItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <CalendarDays size={28} className="text-gray-200" />
            {scheduleItems.length > 0 ? 'Nothing active this week' : 'No schedule items yet'}
          </div>
        ) : (
          <div className="space-y-3">
            {thisWeekItems.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy-800 font-medium leading-snug">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium ${SCHEDULE_STATUS_COLOR[item.status] ?? 'text-gray-500'}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.percent_complete > 0 && (
                      <span className="text-xs text-gray-400">{item.percent_complete}%</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  {item.percent_complete > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5">
                      <div
                        className="bg-blue-400 h-1 rounded-full transition-all"
                        style={{ width: `${item.percent_complete}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(item.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 5 — Closeout Panel (active / warranty / closed jobs) */}
      {['active', 'warranty', 'closed'].includes(job.status) && (
        <div className="md:col-span-2">
          <CloseoutPanel
            job={{
              id: job.id,
              status: job.status,
              warranty_start_date: job.warranty_start_date ?? null,
              warranty_end_date: job.warranty_end_date ?? null,
              closeout_checklist: job.closeout_checklist ?? {},
            }}
            canEdit={jobPerm?.can_edit ?? false}
          />
        </div>
      )}

      {/* Card 6 — Connected Systems */}
      <ConnectedSystemsCard jobId={id} />

      {/* Card 7 — Budget Snapshot (permission-gated) */}
      {canSeeBudget && (
        <div className="bg-white rounded-xl border border-border p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-navy-900 text-base">Budget Snapshot</h3>
            <Link href={`/jobs/${id}/budget`} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
              Full budget →
            </Link>
          </div>
          {budgetLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
              <DollarSign size={28} className="text-gray-200" />
              No budget lines yet
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Contract */}
              {job.contract_amount != null && (
                <div className="bg-gray-50 rounded-xl border border-border px-4 py-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Contract</p>
                  <p className="font-display font-semibold text-lg text-navy-900">{fmtCurrency(job.contract_amount)}</p>
                </div>
              )}
              {/* Budget */}
              <div className="bg-gray-50 rounded-xl border border-border px-4 py-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Budget</p>
                <p className="font-display font-semibold text-lg text-navy-900">{fmtCurrency(totalBudget)}</p>
              </div>
              {/* Committed */}
              <div className="bg-gray-50 rounded-xl border border-border px-4 py-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Committed</p>
                <p className="font-display font-semibold text-lg text-navy-900">{fmtCurrency(totalCommitted)}</p>
                {totalBudget > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {((totalCommitted / totalBudget) * 100).toFixed(0)}% of budget
                  </p>
                )}
              </div>
              {/* Variance */}
              <div className={`rounded-xl border px-4 py-3 ${budgetVariance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-xs font-medium mb-1 flex items-center gap-1 ${budgetVariance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  <TrendingUp size={11} />
                  Variance
                </p>
                <p className={`font-display font-semibold text-lg ${budgetVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {budgetVariance >= 0 ? '+' : ''}{fmtCurrency(budgetVariance)}
                </p>
                <p className={`text-xs mt-0.5 ${budgetVariance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {budgetVariance >= 0 ? 'under budget' : 'over budget'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
