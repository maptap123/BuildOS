'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { JobStatus, QBSyncStatus } from '@/types'

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

function SummaryCards({ jobs }: { jobs: FinanceJobRow[] }) {
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
      sub: atRisk > 0 ? 'over budget' : 'within budget',
      color: atRisk > 0 ? 'text-red-700' : 'text-green-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-border px-4 py-3">
          <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
          <p className={`font-display font-semibold text-lg leading-tight ${c.color}`}>{c.value}</p>
          {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── Jobs Table ────────────────────────────────────────────────────────────────

function JobsTable({ jobs }: { jobs: FinanceJobRow[] }) {
  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border px-6 py-12 text-center text-gray-400 text-sm">
        No jobs match the current filter.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-x-auto">
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
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FinanceDashboardClient({ jobs }: FinanceDashboardClientProps) {
  const [filter, setFilter] = useState<StatusFilter>('active')

  const filtered = useMemo(() => {
    if (filter === 'all')       return jobs
    if (filter === 'completed') return jobs.filter((j) => COMPLETED_STATUSES.includes(j.status))
    return jobs.filter((j) => ACTIVE_STATUSES.includes(j.status))
  }, [jobs, filter])

  const filterBtns: { key: StatusFilter; label: string }[] = [
    { key: 'active',    label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'all',       label: 'All Jobs' },
  ]

  return (
    <div>
      {/* Summary cards use ALL jobs, not filtered */}
      <SummaryCards jobs={filter === 'all' ? jobs : filtered} />

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500 font-medium">Show:</span>
        {filterBtns.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === key
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-border text-gray-500 hover:text-navy-900 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} job{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <JobsTable jobs={filtered} />
    </div>
  )
}
