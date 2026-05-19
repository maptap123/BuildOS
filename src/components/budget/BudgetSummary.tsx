'use client'

import type { Job, BudgetLine } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface Props {
  job: Pick<Job, 'contract_amount' | 'estimated_cost'>
  lines: BudgetLine[]
  approvedCOTotal?: number
}

interface Metric {
  label: string
  value: string
  sub?: string
  highlight?: 'good' | 'bad' | 'neutral'
}

export function BudgetSummary({ job, lines, approvedCOTotal = 0 }: Props) {
  const totalRevised   = lines.reduce((s, l) => s + l.revised_budget, 0)
  const totalCommitted = lines.reduce((s, l) => s + l.committed_cost, 0)
  const totalForecast  = lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
  const variance       = totalRevised - totalForecast

  const revisedContract = (job.contract_amount ?? 0) + approvedCOTotal

  const metrics: Metric[] = [
    {
      label: 'Contract',
      value: revisedContract > 0 ? fmt(revisedContract) : (job.contract_amount != null ? fmt(job.contract_amount) : '—'),
      sub: approvedCOTotal !== 0
        ? `${approvedCOTotal > 0 ? '+' : ''}${fmt(approvedCOTotal)} from COs`
        : undefined,
    },
    {
      label: 'Budget',
      value: fmt(totalRevised),
      sub: revisedContract > 0
        ? `${((totalRevised / revisedContract) * 100).toFixed(1)}% of contract`
        : undefined,
    },
    {
      label: 'Committed',
      value: fmt(totalCommitted),
      sub: totalRevised > 0
        ? `${((totalCommitted / totalRevised) * 100).toFixed(1)}% of budget`
        : undefined,
    },
    {
      label: 'Forecast',
      value: fmt(totalForecast),
      sub: totalRevised > 0
        ? `${((totalForecast / totalRevised) * 100).toFixed(1)}% of budget`
        : undefined,
    },
    {
      label: 'Variance',
      value: variance >= 0 ? `+${fmt(variance)}` : fmt(variance),
      sub: variance >= 0 ? 'under budget' : 'over budget',
      highlight: variance >= 0 ? 'good' : 'bad',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {metrics.map(m => (
        <div
          key={m.label}
          className={`bg-white rounded-xl border px-4 py-3 ${
            m.highlight === 'good'
              ? 'border-green-200 bg-green-50'
              : m.highlight === 'bad'
              ? 'border-red-200 bg-red-50'
              : 'border-border'
          } ${m.label === 'Variance' ? 'col-span-2 md:col-span-1' : ''}`}
        >
          <p className="text-xs text-gray-500 font-medium mb-1">{m.label}</p>
          <p className={`font-display font-semibold text-lg leading-tight ${
            m.highlight === 'good'
              ? 'text-green-700'
              : m.highlight === 'bad'
              ? 'text-red-700'
              : 'text-navy-900'
          }`}>
            {m.value}
          </p>
          {m.sub && (
            <p className={`text-xs mt-0.5 ${
              m.highlight === 'good'
                ? 'text-green-600'
                : m.highlight === 'bad'
                ? 'text-red-600'
                : 'text-gray-400'
            }`}>
              {m.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
