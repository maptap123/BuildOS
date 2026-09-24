'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, Users, CloudSun, AlertTriangle, ChevronRight, BellOff } from 'lucide-react'
import type { JobStatus } from '@/types'
import {
  SummaryHeader, StatGrid, StatTile, FilterPanel, FilterChips, FilterSelect, SearchBox,
  FilterSummary, EmptyState, todayStr, addDays, fmtDay,
  type ActiveFilter,
} from '@/components/summary/SummaryKit'

export interface LogSummaryRow {
  id: string
  job_id: string
  log_date: string
  author_name: string | null
  weather_summary: string | null
  temperature_high: number | null
  manpower_count: number | null
  work_performed: string | null
  delays: string | null
  safety_notes: string | null
  job: { id: string; name: string; job_number: string | null; status: JobStatus }
}

export interface ActiveJobRef { id: string; name: string; job_number: string | null }

type Range = '7d' | '30d' | '90d'
type View = 'feed' | 'quiet'

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<Range, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }
const QUIET_DAYS = 7

export function LogsSummaryClient({ logs, activeJobs }: { logs: LogSummaryRow[]; activeJobs: ActiveJobRef[] }) {
  const today = todayStr()

  const [view, setView] = useState<View>('feed')
  const [range, setRange] = useState<Range>('7d')
  const [jobId, setJobId] = useState('')
  const [author, setAuthor] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [search, setSearch] = useState('')

  const since = addDays(today, -(RANGE_DAYS[range] - 1))

  const inRange = useMemo(() => logs.filter(l => l.log_date >= since), [logs, since])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inRange.filter(l =>
      (!jobId || l.job_id === jobId)
      && (!author || l.author_name === author)
      && (!issuesOnly || !!l.delays?.trim() || !!l.safety_notes?.trim())
      && (!q
        || (l.work_performed ?? '').toLowerCase().includes(q)
        || l.job.name.toLowerCase().includes(q)
        || (l.author_name ?? '').toLowerCase().includes(q)),
    )
  }, [inRange, jobId, author, issuesOnly, search])

  const jobsLogged = new Set(visible.map(l => l.job_id)).size
  const crewDays = visible.reduce((s, l) => s + (l.manpower_count ?? 0), 0)
  const issueCount = visible.filter(l => !!l.delays?.trim() || !!l.safety_notes?.trim()).length

  // Active jobs with no log in the last QUIET_DAYS — independent of filters
  const quietJobs = useMemo(() => {
    const lastLog = new Map<string, string>()
    for (const l of logs) {
      const prev = lastLog.get(l.job_id)
      if (!prev || l.log_date > prev) lastLog.set(l.job_id, l.log_date)
    }
    const cutoff = addDays(today, -(QUIET_DAYS - 1))
    return activeJobs
      .map(j => ({ ...j, last: lastLog.get(j.id) ?? null }))
      .filter(j => !j.last || j.last < cutoff)
      .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? '') || a.name.localeCompare(b.name))
  }, [logs, activeJobs, today])

  const jobOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of inRange) m.set(l.job_id, l.job.job_number ? `${l.job.name} (#${l.job.job_number})` : l.job.name)
    if (jobId && !m.has(jobId)) {
      const l = logs.find(x => x.job_id === jobId)
      if (l) m.set(jobId, l.job.name)
    }
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [inRange, logs, jobId])

  const authorOptions = useMemo(
    () => [...new Set(inRange.map(l => l.author_name).filter((a): a is string => !!a))].sort().map(a => ({ value: a, label: a })),
    [inRange],
  )

  const groups = useMemo(() => {
    const byDay = new Map<string, LogSummaryRow[]>()
    for (const l of visible) {
      const list = byDay.get(l.log_date) ?? []
      list.push(l)
      byDay.set(l.log_date, list)
    }
    return [...byDay.keys()].sort().reverse().map(day => ({ day, logs: byDay.get(day)! }))
  }, [visible])

  const activeFilters: ActiveFilter[] = [
    { key: 'range', label: RANGE_LABEL[range], onRemove: range === '7d' ? undefined : () => setRange('7d') },
  ]
  if (jobId) activeFilters.push({ key: 'job', label: jobOptions.find(o => o.value === jobId)?.label ?? 'Job', onRemove: () => setJobId('') })
  if (author) activeFilters.push({ key: 'author', label: author, onRemove: () => setAuthor('') })
  if (issuesOnly) activeFilters.push({ key: 'issues', label: 'Delays / safety only', onRemove: () => setIssuesOnly(false) })
  if (search.trim()) activeFilters.push({ key: 'q', label: `“${search.trim()}”`, onRemove: () => setSearch('') })

  function clearAll() {
    setRange('7d'); setJobId(''); setAuthor(''); setIssuesOnly(false); setSearch('')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <SummaryHeader title="Daily Logs" subtitle="Field activity across every job" />

      <StatGrid>
        <StatTile label="Logs" value={visible.length} sub={RANGE_LABEL[range].toLowerCase()} active={view === 'feed' && !issuesOnly} onClick={() => { setView('feed'); setIssuesOnly(false) }} />
        <StatTile label="Jobs logged" value={jobsLogged} sub={crewDays > 0 ? `${crewDays} crew-days` : undefined} />
        <StatTile
          label="Delays / safety"
          value={issueCount}
          tone={issueCount > 0 ? 'gold' : 'default'}
          active={view === 'feed' && issuesOnly}
          onClick={() => { setView('feed'); setIssuesOnly(true) }}
        />
        <StatTile
          label={`Quiet ${QUIET_DAYS}+ days`}
          value={quietJobs.length}
          sub="active jobs, no log"
          tone={quietJobs.length > 0 ? 'alert' : 'good'}
          active={view === 'quiet'}
          onClick={() => setView(view === 'quiet' ? 'feed' : 'quiet')}
        />
      </StatGrid>

      {view === 'quiet' ? (
        <QuietJobs jobs={quietJobs} onBack={() => setView('feed')} today={today} />
      ) : (
        <>
          <FilterPanel>
            <FilterChips
              options={(['7d', '30d', '90d'] as Range[]).map(key => ({ key, label: RANGE_LABEL[key] }))}
              value={range}
              onChange={setRange}
            />
            <div className="flex gap-2 flex-wrap items-end">
              <FilterSelect label="Job" value={jobId} onChange={setJobId} options={jobOptions} allLabel="All jobs" />
              <FilterSelect label="Author" value={author} onChange={setAuthor} options={authorOptions} allLabel="Everyone" />
            </div>
            <SearchBox value={search} onChange={setSearch} placeholder="Search work performed, jobs, people" />
          </FilterPanel>

          <FilterSummary
            shown={visible.length}
            total={inRange.length}
            noun={`log${visible.length !== 1 ? 's' : ''}`}
            filters={activeFilters}
            onClearAll={clearAll}
          />

          {visible.length === 0 ? (
            <EmptyState
              icon={FileText}
              message="No logs match these filters."
              action={range !== '90d' ? (
                <button onClick={() => setRange('90d')} className="text-sm font-semibold text-gold-600">Look back 90 days →</button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-5">
              {groups.map(g => (
                <section key={g.day}>
                  <h2 className={`text-[11px] font-bold uppercase tracking-widest mb-2 px-1 ${g.day === today ? 'text-gold-600' : 'text-navy-600'}`}>
                    {g.day === today ? 'Today' : g.day === addDays(today, -1) ? 'Yesterday' : fmtDay(g.day)}
                    <span className="ml-1.5 font-semibold text-gray-400 normal-case tracking-normal">{g.logs.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {g.logs.map(l => <LogCard key={l.id} log={l} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LogCard({ log }: { log: LogSummaryRow }) {
  const hasIssue = !!log.delays?.trim() || !!log.safety_notes?.trim()
  return (
    <Link
      href={`/jobs/${log.job_id}/logs`}
      className="block bg-white rounded-xl border border-border px-4 py-3 hover:border-gray-400 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900 truncate">{log.job.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{log.author_name ?? 'Unknown author'}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 shrink-0">
          {log.manpower_count != null && log.manpower_count > 0 && (
            <span className="flex items-center gap-0.5"><Users size={11} />{log.manpower_count}</span>
          )}
          {(log.weather_summary || log.temperature_high != null) && (
            <span className="flex items-center gap-0.5">
              <CloudSun size={11} />
              {log.temperature_high != null ? `${Math.round(log.temperature_high)}°` : ''}
            </span>
          )}
        </div>
      </div>
      {log.work_performed?.trim() ? (
        <p className="text-sm text-gray-700 mt-1.5 line-clamp-3 whitespace-pre-line">{log.work_performed}</p>
      ) : log.weather_summary ? (
        <p className="text-xs text-gray-400 mt-1 truncate">{log.weather_summary}</p>
      ) : null}
      {hasIssue && (
        <p className="flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 rounded-md px-2 py-1 mt-2">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span className="line-clamp-2">{log.delays?.trim() || log.safety_notes?.trim()}</span>
        </p>
      )}
    </Link>
  )
}

function QuietJobs({ jobs, onBack, today }: {
  jobs: (ActiveJobRef & { last: string | null })[]
  onBack: () => void
  today: string
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-red-600">
          Active jobs with no log in {QUIET_DAYS}+ days
        </h2>
        <button onClick={onBack} className="text-xs font-semibold text-gold-600">Back to feed</button>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={BellOff} message="Every active job has a log this week." />
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-gray-100 overflow-hidden">
          {jobs.map(j => {
            const days = j.last
              ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(j.last + 'T12:00:00').getTime()) / 86_400_000)
              : null
            return (
              <Link key={j.id} href={`/jobs/${j.id}/logs`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{j.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {j.job_number ? `#${j.job_number} · ` : ''}
                    {j.last ? `Last log ${fmtDay(j.last)} · ${days} days ago` : 'No log in 90 days'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
