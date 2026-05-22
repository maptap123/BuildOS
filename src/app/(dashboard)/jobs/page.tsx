'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Clock, CheckSquare, CalendarDays, Plus, FileText, Cloud, Users, Briefcase } from 'lucide-react'
import { useAgenda } from '@/hooks/useAgenda'
import { useJobs } from '@/hooks/useJobs'
import { usePermissions } from '@/hooks/usePermissions'
import { AddJobModal } from '@/components/jobs'
import { MobileHome } from '@/components/mobile/MobileHome'
import type { Job, AgendaTask, AgendaScheduleItem, AgendaLogEntry } from '@/types'

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-border px-4 py-3 text-center">
      {loading
        ? <div className="h-7 w-10 mx-auto rounded bg-gray-100 animate-pulse mb-1" />
        : <p className="text-2xl font-bold text-navy-900 font-display leading-none">{value}</p>}
      <p className="text-[11px] text-gray-400 mt-1 leading-tight">{label}</p>
    </div>
  )
}

function AgendaCard({
  icon: Icon,
  title,
  count,
  accentColor,
  loading,
  children,
}: {
  icon: React.ElementType
  title: string
  count: number
  accentColor: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={15} className={accentColor} />
          <h3 className="font-display font-semibold text-navy-900 text-sm">{title}</h3>
        </div>
        {!loading && count > 0 && (
          <span className="text-xs font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 leading-none">
            {count}
          </span>
        )}
      </div>
      {loading
        ? <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-9 rounded bg-gray-100 animate-pulse" />)}</div>
        : children}
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="text-xs text-gray-400 py-1">{message}</p>
}

const SELECT_JOB_LABELS: Record<string, string> = {
  budget: 'Budget',
  schedule: 'Schedule',
  tasks: 'Tasks',
  logs: 'Logs',
  profitability: 'Profitability',
}

function TaskRow({ task, router }: { task: AgendaTask; router: ReturnType<typeof useRouter> }) {
  return (
    <button
      onClick={() => router.push(`/jobs/${task.job_id}/tasks`)}
      className="w-full flex flex-col gap-0.5 text-left hover:bg-gray-50 rounded-lg px-2 py-2 -mx-2 transition-colors"
    >
      <span className="text-xs font-medium text-navy-900 truncate">{task.title}</span>
      <span className="text-[11px] text-gray-400 truncate">{task.job_name}</span>
    </button>
  )
}

function ScheduleRow({ item, router }: { item: AgendaScheduleItem; router: ReturnType<typeof useRouter> }) {
  return (
    <button
      onClick={() => router.push(`/jobs/${item.job_id}/schedule`)}
      className="w-full flex flex-col gap-0.5 text-left hover:bg-gray-50 rounded-lg px-2 py-2 -mx-2 transition-colors"
    >
      <span className="text-xs font-medium text-navy-900 truncate">{item.title}</span>
      <span className="text-[11px] text-gray-400 truncate">{item.job_name}</span>
    </button>
  )
}

function formatLogDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function RecentLogCard({ entry, router }: { entry: AgendaLogEntry; router: ReturnType<typeof useRouter> }) {
  const photos = entry.photos ?? []
  const [month, day] = formatLogDate(entry.log_date).split(' ')

  return (
    <button
      onClick={() => router.push(`/jobs/${entry.job_id}/logs`)}
      className="w-full text-left bg-white rounded-xl border border-border p-4 hover:border-gold-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 bg-navy-50 rounded-lg px-2.5 py-2 text-center min-w-[52px]">
          <p className="text-[10px] text-navy-400 font-semibold uppercase leading-none">{month}</p>
          <p className="text-lg font-bold text-navy-900 leading-none mt-1">{day}</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-navy-900 truncate">{entry.job_name}</span>
            {entry.author_name && <span className="text-xs text-gray-400">by {entry.author_name}</span>}
          </div>

          <p className="text-sm text-navy-700 leading-relaxed mt-1 line-clamp-3">
            {entry.work_performed ?? 'No work notes entered.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
            {entry.weather_summary && (
              <span className="flex items-center gap-1">
                <Cloud size={12} />
                {entry.weather_summary}
              </span>
            )}
            {entry.manpower_count != null && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                {entry.manpower_count} worker{entry.manpower_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {photos.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-hidden">
              {photos.map(photo => (
                <div key={photo.id} className="h-16 w-20 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url ?? ''} alt={photo.caption ?? photo.file_name ?? ''} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LogRow({ entry, router }: { entry: AgendaLogEntry; router: ReturnType<typeof useRouter> }) {
  return (
    <button
      onClick={() => router.push(`/jobs/${entry.job_id}/logs`)}
      className="w-full flex flex-col gap-0.5 text-left hover:bg-gray-50 rounded-lg px-2 py-2 -mx-2 transition-colors"
    >
      <span className="text-xs font-medium text-navy-900 truncate">
        {entry.author_name ?? 'Unknown'} · {entry.job_name}
      </span>
      <span className="text-[11px] text-gray-400 truncate">{entry.work_performed ?? '—'}</span>
    </button>
  )
}

function JobsDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showAddJob, setShowAddJob] = useState(false)

  const agenda = useAgenda()
  const { jobs: activeJobs, loading: jobsLoading } = useJobs({ statuses: ['active'] })
  const { can, isAdmin } = usePermissions()
  const canCreate = can('jobs', 'create') || isAdmin()
  const selectJobFor = searchParams.get('selectJob')
  const selectJobLabel = selectJobFor ? SELECT_JOB_LABELS[selectJobFor] : null

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  function handleJobCreated(job: Job) {
    setShowAddJob(false)
    router.push(`/jobs/${job.id}`)
  }

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">{today}</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowAddJob(true)}
            className="md:hidden flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0"
          >
            <Plus size={16} />
            New Job
          </button>
        )}
      </div>

      {selectJobLabel && (
        <div className="bg-gold-50 border border-gold-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-100 flex items-center justify-center shrink-0">
            <Briefcase size={16} className="text-gold-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-navy-900">Select a job to open {selectJobLabel}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick a job from the left panel, then that tab will open for the selected job.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Jobs"  value={activeJobs.length}       loading={jobsLoading}    />
        <StatCard label="Past Due"     value={agenda.past_due.length}  loading={agenda.loading} />
        <StatCard label="Due Today"    value={agenda.due_today.length} loading={agenda.loading} />
        <StatCard label="This Week"    value={agenda.this_week.length} loading={agenda.loading} />
      </div>

      {/* Recent daily logs */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-navy-500" />
            <h2 className="font-display font-semibold text-navy-900 text-lg">Recent Daily Logs</h2>
          </div>
          {!agenda.loading && agenda.team_activity.length > 0 && (
            <span className="text-xs font-semibold bg-gray-100 text-gray-600 rounded-full px-2.5 py-1 leading-none">
              Latest {agenda.team_activity.length}
            </span>
          )}
        </div>

        {agenda.loading ? (
          <div className="grid grid-cols-1 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : agenda.team_activity.length === 0 ? (
          <div className="bg-white rounded-xl border border-border px-4 py-6">
            <Empty message={agenda.missing_perms.includes('logs') ? 'No log access.' : 'No recent daily logs.'} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {agenda.team_activity.map(l => <RecentLogCard key={l.id} entry={l} router={router} />)}
          </div>
        )}
      </section>

      {/* Agenda grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <AgendaCard
          icon={Clock}
          title="Past Due"
          count={agenda.past_due.length}
          accentColor="text-red-500"
          loading={agenda.loading}
        >
          {agenda.past_due.length === 0
            ? <Empty message={agenda.missing_perms.includes('tasks') ? 'No task access.' : 'No overdue tasks.'} />
            : <div className="divide-y divide-gray-50">
                {agenda.past_due.map(t => <TaskRow key={t.id} task={t} router={router} />)}
              </div>}
        </AgendaCard>

        <AgendaCard
          icon={CheckSquare}
          title="Due Today"
          count={agenda.due_today.length}
          accentColor="text-gold-500"
          loading={agenda.loading}
        >
          {agenda.due_today.length === 0
            ? <Empty message={agenda.missing_perms.includes('tasks') ? 'No task access.' : 'Nothing due today.'} />
            : <div className="divide-y divide-gray-50">
                {agenda.due_today.map(t => <TaskRow key={t.id} task={t} router={router} />)}
              </div>}
        </AgendaCard>

        <AgendaCard
          icon={CalendarDays}
          title="This Week"
          count={agenda.this_week.length}
          accentColor="text-blue-500"
          loading={agenda.loading}
        >
          {agenda.this_week.length === 0
            ? <Empty message={agenda.missing_perms.includes('schedule') ? 'No schedule access.' : 'Nothing scheduled this week.'} />
            : <div className="divide-y divide-gray-50">
                {agenda.this_week.map(s => <ScheduleRow key={s.id} item={s} router={router} />)}
              </div>}
        </AgendaCard>

      </div>

      {showAddJob && (
        <AddJobModal
          onClose={() => setShowAddJob(false)}
          onCreated={handleJobCreated}
        />
      )}
    </div>
  )
}

export default function JobsDashboardPage() {
  return (
    <>
      {/* Mobile: full action launchpad */}
      <div className="md:hidden -mx-4 -mt-6">
        <MobileHome jobId={null} jobName={null} />
      </div>

      {/* Desktop: existing dashboard */}
      <div className="hidden md:block">
        <Suspense fallback={null}>
          <JobsDashboardContent />
        </Suspense>
      </div>
    </>
  )
}
