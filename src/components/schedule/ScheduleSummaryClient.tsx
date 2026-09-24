'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Diamond, ChevronRight } from 'lucide-react'
import type { JobStatus, ScheduleItemStatus, ScheduleItemType } from '@/types'
import {
  SummaryHeader, StatGrid, StatTile, FilterPanel, FilterChips, FilterSelect, SearchBox,
  FilterSummary, EmptyState, todayStr, addDays, fmtDay,
  type ActiveFilter, type ChipOption,
} from '@/components/summary/SummaryKit'

export interface ScheduleSummaryItem {
  id: string
  job_id: string
  title: string
  status: ScheduleItemStatus
  type: ScheduleItemType
  start_date: string
  end_date: string
  percent_complete: number | null
  trade: string | null
  color: string | null
  job: { id: string; name: string; job_number: string | null; status: JobStatus }
}

type Range = 'today' | '7d' | '14d' | '30d' | 'pastdue'
type JobStatusFilter = 'active' | 'presale' | 'warranty' | 'all'
type TypeFilter = 'all' | 'phase' | 'milestone'

const RANGE_LABEL: Record<Range, string> = {
  today:   'Today',
  '7d':    'Next 7 days',
  '14d':   'Next 2 weeks',
  '30d':   'Next 30 days',
  pastdue: 'Past due',
}
const RANGE_DAYS: Record<Exclude<Range, 'pastdue'>, number> = { today: 0, '7d': 6, '14d': 13, '30d': 29 }

const JOB_STATUS_LABEL: Record<JobStatusFilter, string> = {
  active: 'Active jobs', presale: 'Presale jobs', warranty: 'Warranty jobs', all: 'All open jobs',
}

const STATUS_HEX: Record<ScheduleItemStatus, string> = {
  not_started: '#9CA3AF',
  in_progress: '#3B82F6',
  blocked:     '#EF4444',
  completed:   '#22C55E',
  delayed:     '#F59E0B',
}
const STATUS_BADGE: Partial<Record<ScheduleItemStatus, { label: string; cls: string }>> = {
  in_progress: { label: 'In progress', cls: 'bg-blue-50 text-blue-700' },
  blocked:     { label: 'Blocked',     cls: 'bg-red-50 text-red-600' },
  completed:   { label: 'Done',        cls: 'bg-green-50 text-green-700' },
  delayed:     { label: 'Delayed',     cls: 'bg-amber-50 text-amber-700' },
}

// Past-due only looks back 30 days: the BuilderTrend import left every
// historical item "not_started", so an unbounded look-back is thousands of
// stale rows rather than things someone needs to chase.
const PAST_DUE_LOOKBACK = 30

function overlaps(item: ScheduleSummaryItem, from: string, to: string) {
  return item.start_date <= to && item.end_date >= from
}

function isPastDue(item: ScheduleSummaryItem, today: string) {
  return item.end_date < today
    && item.end_date >= addDays(today, -PAST_DUE_LOOKBACK)
    && item.status !== 'completed'
    && (item.percent_complete ?? 0) < 100
}

function fmtShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ScheduleSummaryClient({ items }: { items: ScheduleSummaryItem[] }) {
  const today = todayStr()

  const [range, setRange] = useState<Range>('7d')
  const [jobStatus, setJobStatus] = useState<JobStatusFilter>('active')
  const [jobId, setJobId] = useState('')
  const [trade, setTrade] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')

  // Everything except the date range — tiles count against this set so each
  // tile says what you'd get by tapping it.
  const baseItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (jobStatus === 'all' || i.job.status === jobStatus)
      && (!jobId || i.job_id === jobId)
      && (!trade || i.trade === trade)
      && (type === 'all' || i.type === type)
      && (!q || i.title.toLowerCase().includes(q) || i.job.name.toLowerCase().includes(q)),
    )
  }, [items, jobStatus, jobId, trade, type, search])

  function inRange(i: ScheduleSummaryItem, r: Range) {
    if (r === 'pastdue') return isPastDue(i, today)
    return overlaps(i, today, addDays(today, RANGE_DAYS[r]))
  }

  const counts = useMemo(() => {
    const c = { today: 0, '7d': 0, '14d': 0, '30d': 0, pastdue: 0 } as Record<Range, number>
    for (const i of baseItems) for (const r of Object.keys(c) as Range[]) if (inRange(i, r)) c[r]++
    return c
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseItems, today])

  const visible = useMemo(
    () => baseItems.filter(i => inRange(i, range)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseItems, range, today],
  )

  const jobsInView = new Set(visible.map(i => i.job_id)).size

  // Dropdown options come from the job-status slice so they never offer a job
  // that would show nothing.
  const jobOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) {
      if (jobStatus !== 'all' && i.job.status !== jobStatus) continue
      m.set(i.job_id, i.job.job_number ? `${i.job.name} (#${i.job.job_number})` : i.job.name)
    }
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [items, jobStatus])

  const tradeOptions = useMemo(
    () => [...new Set(items.map(i => i.trade).filter((t): t is string => !!t))].sort().map(t => ({ value: t, label: t })),
    [items],
  )

  // ── Grouping: "already underway" first, then one group per start day ──────
  const groups = useMemo(() => {
    if (range === 'pastdue') {
      return [{ key: 'pastdue', title: 'Past due', items: [...visible].sort((a, b) => b.end_date.localeCompare(a.end_date)) }]
    }
    const underway = visible.filter(i => i.start_date < today)
    const byDay = new Map<string, ScheduleSummaryItem[]>()
    for (const i of visible) {
      if (i.start_date < today) continue
      const list = byDay.get(i.start_date) ?? []
      list.push(i)
      byDay.set(i.start_date, list)
    }
    const out: { key: string; title: string; items: ScheduleSummaryItem[] }[] = []
    if (underway.length) out.push({ key: 'underway', title: 'Already underway', items: underway.sort((a, b) => a.end_date.localeCompare(b.end_date)) })
    for (const day of [...byDay.keys()].sort()) {
      out.push({ key: day, title: day === today ? 'Starting today' : fmtDay(day), items: byDay.get(day)! })
    }
    return out
  }, [visible, range, today])

  // ── Active filter pills ────────────────────────────────────────────────────
  const activeFilters: ActiveFilter[] = [
    { key: 'range', label: RANGE_LABEL[range], onRemove: range === '7d' ? undefined : () => setRange('7d') },
    { key: 'status', label: JOB_STATUS_LABEL[jobStatus], onRemove: jobStatus === 'active' ? undefined : () => setJobStatus('active') },
  ]
  if (jobId) activeFilters.push({ key: 'job', label: jobOptions.find(o => o.value === jobId)?.label ?? 'Job', onRemove: () => setJobId('') })
  if (trade) activeFilters.push({ key: 'trade', label: trade, onRemove: () => setTrade('') })
  if (type !== 'all') activeFilters.push({ key: 'type', label: type === 'phase' ? 'Phases only' : 'Milestones only', onRemove: () => setType('all') })
  if (search.trim()) activeFilters.push({ key: 'q', label: `“${search.trim()}”`, onRemove: () => setSearch('') })

  function clearAll() {
    setRange('7d'); setJobStatus('active'); setJobId(''); setTrade(''); setType('all'); setSearch('')
  }

  const rangeOptions: ChipOption<Range>[] = (['today', '7d', '14d', '30d', 'pastdue'] as Range[])
    .map(key => ({ key, label: RANGE_LABEL[key], count: counts[key] }))

  return (
    <div className="max-w-3xl mx-auto">
      <SummaryHeader title="Schedule" subtitle="What's on the calendar across every job" />

      <StatGrid>
        <StatTile label="Today" value={counts.today} sub="items on the calendar" active={range === 'today'} onClick={() => setRange('today')} />
        <StatTile label="Next 7 days" value={counts['7d']} active={range === '7d'} onClick={() => setRange('7d')} />
        <StatTile label="Next 30 days" value={counts['30d']} active={range === '30d'} onClick={() => setRange('30d')} />
        <StatTile
          label="Past due"
          value={counts.pastdue}
          sub={`not done · last ${PAST_DUE_LOOKBACK} days`}
          tone={counts.pastdue > 0 ? 'alert' : 'good'}
          active={range === 'pastdue'}
          onClick={() => setRange('pastdue')}
        />
      </StatGrid>

      <FilterPanel>
        <FilterChips options={rangeOptions} value={range} onChange={setRange} />
        <FilterChips
          options={(['active', 'presale', 'warranty', 'all'] as JobStatusFilter[]).map(key => ({
            key, label: key === 'all' ? 'All open' : key[0].toUpperCase() + key.slice(1),
          }))}
          value={jobStatus}
          onChange={v => { setJobStatus(v); setJobId('') }}
          label="Jobs"
        />
        <div className="flex gap-2 flex-wrap items-end">
          <FilterSelect label="Job" value={jobId} onChange={setJobId} options={jobOptions} allLabel="All jobs" />
          {tradeOptions.length > 0 && (
            <FilterSelect label="Trade" value={trade} onChange={setTrade} options={tradeOptions} allLabel="All trades" />
          )}
          <FilterSelect
            label="Type"
            value={type === 'all' ? '' : type}
            onChange={v => setType((v || 'all') as TypeFilter)}
            options={[{ value: 'phase', label: 'Phases' }, { value: 'milestone', label: 'Milestones' }]}
            allLabel="Phases & milestones"
          />
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search items or jobs" />
      </FilterPanel>

      <FilterSummary
        shown={visible.length}
        total={baseItems.length}
        noun={`item${visible.length !== 1 ? 's' : ''} across ${jobsInView} job${jobsInView !== 1 ? 's' : ''}`}
        filters={activeFilters}
        onClearAll={clearAll}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          message={range === 'pastdue' ? 'Nothing past due. Nice.' : `Nothing scheduled — ${RANGE_LABEL[range].toLowerCase()}.`}
          action={range !== '30d' && counts['30d'] > 0 ? (
            <button onClick={() => setRange('30d')} className="text-sm font-semibold text-gold-600">
              Show next 30 days ({counts['30d']}) →
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <section key={g.key}>
              <h2 className={`text-[11px] font-bold uppercase tracking-widest mb-2 px-1 ${
                g.key === 'pastdue' ? 'text-red-600' : g.key === today ? 'text-gold-600' : 'text-navy-600'
              }`}>
                {g.title}
                <span className="ml-1.5 font-semibold text-gray-400 normal-case tracking-normal">{g.items.length}</span>
              </h2>
              <div className="bg-white rounded-xl border border-border divide-y divide-gray-100 overflow-hidden">
                {g.items.map(item => <ScheduleRow key={item.id} item={item} pastDue={range === 'pastdue'} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ item, pastDue }: { item: ScheduleSummaryItem; pastDue: boolean }) {
  const color = item.color ?? STATUS_HEX[item.status]
  const badge = STATUS_BADGE[item.status]
  const pct = item.percent_complete ?? 0
  const sameDay = item.start_date === item.end_date
  return (
    <Link
      href={`/jobs/${item.job_id}/schedule`}
      className="flex items-stretch gap-3 px-3 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <span className="w-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.type === 'milestone' && <Diamond size={12} className="text-gold-600 shrink-0" fill="currentColor" />}
          <p className="text-sm font-medium text-navy-900 truncate">{item.title}</p>
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">
          {item.job.name}{item.job.job_number ? ` · #${item.job.job_number}` : ''}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
          <span className={pastDue ? 'text-red-600 font-semibold' : 'text-gray-400'}>
            {sameDay ? fmtShort(item.start_date) : `${fmtShort(item.start_date)} – ${fmtShort(item.end_date)}`}
          </span>
          {item.trade && <span className="text-gray-400">· {item.trade}</span>}
          {badge && <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${badge.cls}`}>{badge.label}</span>}
          {pct > 0 && pct < 100 && <span className="text-gray-400 tabular-nums">{pct}%</span>}
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300 self-center shrink-0" />
    </Link>
  )
}
