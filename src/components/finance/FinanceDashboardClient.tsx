'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, BarChart3 } from 'lucide-react'
import type { JobStatus, QBSyncStatus } from '@/types'
import {
  FilterPanel, FilterChips, SearchBox, FilterSummary, EmptyState,
  type ActiveFilter,
} from '@/components/summary/SummaryKit'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FinanceJobRow {
  id: string
  job_number: string
  name: string
  status: JobStatus
  contract_amount: number
  estimated_cost: number   // budget_lines sum OR job.estimated_cost
  actuals_total: number    // approved + paid actuals
  qb_sync_status: QBSyncStatus
  qb_last_synced_at: string | null
}

export interface FinanceDashboardClientProps {
  jobs: FinanceJobRow[]
}

type StatusFilter = 'all' | 'active' | 'completed'

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  active: 'Open jobs', completed: 'Completed jobs', all: 'All jobs',
}

function isOverBudget(j: FinanceJobRow) {
  return j.estimated_cost > 0 && j.actuals_total > j.estimated_cost
}

const COMPLETED_STATUSES: JobStatus[] = ['closed', 'archived']
const ACTIVE_STATUSES: JobStatus[] = ['lead', 'presale', 'active', 'warranty']

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const pct = (num: number, den: number) =>
  den === 0 ? 0 : (num / den) * 100

function budgetUsedColor(used: number): string {
  if (used >= 95) return 'bg-red-500'
  if (used >= 80) return 'bg-amber-400'
  return 'bg-green-500'
}

function budgetUsedTextColor(used: number): string {
  if (used >= 95) return 'text-red-700'
  if (used >= 80) return 'text-amber-700'
  return 'text-green-700'
}

function QBBadge({ status }: { status: QBSyncStatus }) {
  const map: Record<QBSyncStatus, { label: string; cls: string }> = {
    synced:     { label: 'QB Synced',  cls: 'bg-green-100 text-green-700' },
    pending:    { label: 'QB Pending', cls: 'bg-amber-100 text-amber-700' },
    error:      { label: 'QB Error',   cls: 'bg-red-100 text-red-700' },
    not_synced: { label: 'Not Synced', cls: 'bg-gray-100 text-gray-500' },
  }
  const { label, cls } = map[status] ?? map.not_synced
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, string> = {
    active:   'bg-blue-100 text-blue-700',
    lead:     'bg-purple-100 text-purple-700',
    presale:  'bg-indigo-100 text-indigo-700',
    warranty: 'bg-yellow-100 text-yellow-700',
    closed:   'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ jobs, overOnly, onToggleOver }: {
  jobs: FinanceJobRow[]
  overOnly: boolean
  onToggleOver: () => void
}) {
  const overCount        = jobs.filter(isOverBudget).length
  const totalContract    = jobs.reduce((s, j) => s + j.contract_amount, 0)
  const totalEstimated   = jobs.reduce((s, j) => s + j.estimated_cost, 0)
  const totalActuals     = jobs.reduce((s, j) => s + j.actuals_total, 0)
  const projectedMargin  = pct(totalContract - totalEstimated, totalContract)
  const atRisk           = totalActuals - totalEstimated

  const cards = [
    {
      label: 'Total Contract Value',
      value: fmt(totalContract),
      sub: `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`,
      color: 'text-navy-900',
    },
    {
      label: 'Total Estimated Cost',
      value: fmt(totalEstimated),
      sub: totalContract > 0 ? `${pct(totalEstimated, totalContract).toFixed(1)}% of contract` : undefined,
      color: 'text-navy-900',
    },
    {
      label: 'Actuals To Date',
      value: fmt(totalActuals),
      sub: totalEstimated > 0 ? `${pct(totalActuals, totalEstimated).toFixed(1)}% of budget` : undefined,
      color: totalActuals > totalEstimated ? 'text-red-700' : 'text-navy-900',
    },
    {
      label: 'Projected Margin',
      value: `${projectedMargin.toFixed(1)}%`,
      sub: fmt(totalContract - totalEstimated),
      color: projectedMargin >= 0 ? 'text-green-700' : 'text-red-700',
    },
    {
      label: 'Gross Profit At Risk',
      value: atRisk > 0 ? `+${fmt(atRisk)}` : fmt(atRisk),
      sub: overCount > 0
        ? `${overCount} job${overCount !== 1 ? 's' : ''} over budget · ${overOnly ? 'showing' : 'tap to show'}`
        : 'within budget',
      color: atRisk > 0 || overCount > 0 ? 'text-red-700' : 'text-green-700',
      onClick: overCount > 0 || overOnly ? onToggleOver : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => {
        const onClick = 'onClick' in c ? c.onClick : undefined
        const active = onClick && overOnly
        const body = (
          <>
            <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
            <p className={`font-display font-semibold text-lg leading-tight ${c.color}`}>{c.value}</p>
            {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
          </>
        )
        const cls = `bg-white rounded-xl border px-4 py-3 text-left ${active ? 'border-navy-900 ring-1 ring-navy-900' : 'border-border'}`
        return onClick
          ? <button key={c.label} type="button" onClick={onClick} aria-pressed={!!active} className={`${cls} hover:border-gray-400`}>{body}</button>
          : <div key={c.label} className={cls}>{body}</div>
      })}
    </div>
  )
}

// ── Jobs Table ────────────────────────────────────────────────────────────────

function JobsTable({ jobs }: { jobs: FinanceJobRow[] }) {
  if (jobs.length === 0) {
    return <EmptyState icon={BarChart3} message="No jobs match these filters." />
  }

  return (
    <>
    <JobCards jobs={jobs} />
    <div className="hidden md:block bg-white rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="border-b border-border text-xs text-gray-500 font-semibold uppercase tracking-wide">
            <th className="text-left px-4 py-3">Job</th>
            <th className="text-left px-3 py-3">Status</th>
            <th className="text-right px-3 py-3">Contract</th>
            <th className="text-right px-3 py-3">Est. Cost</th>
            <th className="text-right px-3 py-3">Actuals</th>
            <th className="text-right px-3 py-3">Remaining</th>
            <th className="text-left px-3 py-3 min-w-[120px]">% Used</th>
            <th className="text-right px-3 py-3">Margin %</th>
            <th className="text-right px-3 py-3">Variance</th>
            <th className="text-left px-3 py-3">QB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => {
            const budgetUsed    = pct(job.actuals_total, job.estimated_cost)
            const remaining     = job.estimated_cost - job.actuals_total
            const grossMargin   = pct(job.contract_amount - job.estimated_cost, job.contract_amount)
            const variance      = job.contract_amount - job.estimated_cost
            const barColor      = budgetUsedColor(budgetUsed)
            const textColor     = budgetUsedTextColor(budgetUsed)

            return (
              <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.id}/budget`}
                    className="font-medium text-navy-900 hover:text-gold-600 transition-colors"
                  >
                    <span className="text-xs text-gray-400 mr-1.5">{job.job_number}</span>
                    {job.name}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-navy-900">
                  {job.contract_amount > 0 ? fmt(job.contract_amount) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-navy-900">
                  {job.estimated_cost > 0 ? fmt(job.estimated_cost) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-navy-900">
                  {job.actuals_total > 0 ? fmt(job.actuals_total) : '—'}
                </td>
                <td className={`px-3 py-3 text-right font-mono text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                  {job.estimated_cost > 0 ? (remaining < 0 ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)) : '—'}
                </td>
                <td className="px-3 py-3">
                  {job.estimated_cost > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(budgetUsed, 100).toFixed(1)}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-semibold tabular-nums ${textColor}`}>
                        {budgetUsed.toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className={`px-3 py-3 text-right font-mono text-xs ${grossMargin < 0 ? 'text-red-600' : grossMargin >= 15 ? 'text-green-600' : 'text-gray-700'}`}>
                  {job.contract_amount > 0 ? `${grossMargin.toFixed(1)}%` : '—'}
                </td>
                <td className={`px-3 py-3 text-right font-mono text-xs ${variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {job.contract_amount > 0 && job.estimated_cost > 0
                    ? (variance >= 0 ? `+${fmt(variance)}` : fmt(variance))
                    : '—'}
                </td>
                <td className="px-3 py-3">
                  <QBBadge status={job.qb_sync_status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

// ── Mobile job cards ──────────────────────────────────────────────────────────

function JobCards({ jobs }: { jobs: FinanceJobRow[] }) {
  return (
    <div className="md:hidden space-y-2">
      {jobs.map((job) => {
        const budgetUsed  = pct(job.actuals_total, job.estimated_cost)
        const grossMargin = pct(job.contract_amount - job.estimated_cost, job.contract_amount)
        return (
          <Link
            key={job.id}
            href={`/jobs/${job.id}/budget`}
            className="block bg-white rounded-xl border border-border px-4 py-3 active:bg-gray-50"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-900 truncate">{job.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {job.job_number && <span className="text-[11px] text-gray-400">#{job.job_number}</span>}
                  <StatusBadge status={job.status} />
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0 mt-0.5" />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2.5 text-[11px]">
              <div>
                <p className="text-gray-400">Contract</p>
                <p className="font-semibold text-navy-900 tabular-nums">{job.contract_amount > 0 ? fmt(job.contract_amount) : '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Actuals</p>
                <p className="font-semibold text-navy-900 tabular-nums">{job.actuals_total > 0 ? fmt(job.actuals_total) : '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Margin</p>
                <p className={`font-semibold tabular-nums ${grossMargin < 0 ? 'text-red-600' : 'text-navy-900'}`}>
                  {job.contract_amount > 0 && job.estimated_cost > 0 ? `${grossMargin.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
            {job.estimated_cost > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${budgetUsedColor(budgetUsed)}`}
                    style={{ width: `${Math.min(budgetUsed, 100).toFixed(1)}%` }}
                  />
                </div>
                <span className={`text-[11px] font-semibold tabular-nums ${budgetUsedTextColor(budgetUsed)}`}>
                  {budgetUsed.toFixed(0)}% of budget
                </span>
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FinanceDashboardClient({ jobs }: FinanceDashboardClientProps) {
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [search, setSearch] = useState('')
  const [overOnly, setOverOnly] = useState(false)

  // Status + search — the summary cards total this set
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((j) =>
      (filter === 'all'
        || (filter === 'completed' ? COMPLETED_STATUSES : ACTIVE_STATUSES).includes(j.status))
      && (!q || j.name.toLowerCase().includes(q) || j.job_number.toLowerCase().includes(q)),
    )
  }, [jobs, filter, search])

  const filtered = overOnly ? scoped.filter(isOverBudget) : scoped

  const counts: Record<StatusFilter, number> = {
    active:    jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length,
    completed: jobs.filter((j) => COMPLETED_STATUSES.includes(j.status)).length,
    all:       jobs.length,
  }

  const activeFilters: ActiveFilter[] = [
    { key: 'status', label: STATUS_FILTER_LABEL[filter], onRemove: filter === 'active' ? undefined : () => setFilter('active') },
  ]
  if (overOnly) activeFilters.push({ key: 'over', label: 'Over budget', onRemove: () => setOverOnly(false) })
  if (search.trim()) activeFilters.push({ key: 'q', label: `“${search.trim()}”`, onRemove: () => setSearch('') })

  return (
    <div>
      <SummaryCards jobs={scoped} overOnly={overOnly} onToggleOver={() => setOverOnly((v) => !v)} />

      <FilterPanel>
        <FilterChips
          options={(['active', 'completed', 'all'] as StatusFilter[]).map((key) => ({
            key, label: key === 'active' ? 'Open' : key === 'completed' ? 'Completed' : 'All jobs', count: counts[key],
          }))}
          value={filter}
          onChange={setFilter}
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Search job name or number" />
      </FilterPanel>

      <FilterSummary
        shown={filtered.length}
        total={jobs.length}
        noun={`job${filtered.length !== 1 ? 's' : ''}`}
        filters={activeFilters}
        onClearAll={() => { setFilter('active'); setOverOnly(false); setSearch('') }}
      />

      <JobsTable jobs={filtered} />
    </div>
  )
}
