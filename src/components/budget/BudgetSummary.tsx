'use client'

import type { Job, BudgetLine } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface Props {
  job: Pick<Job, 'contract_amount' | 'estimated_cost'>
  lines: BudgetLine[]
  approvedCOTotal?: number
  actualsTotal?: number
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'good' | 'bad' | 'neutral'
}) {
  const bg    = highlight === 'good' ? 'border-green-200 bg-green-50'
              : highlight === 'bad'  ? 'border-red-200 bg-red-50'
              : 'border-border bg-white'
  const val   = highlight === 'good' ? 'text-green-700'
              : highlight === 'bad'  ? 'text-red-700'
              : 'text-navy-900'
  const subCl = highlight === 'good' ? 'text-green-600'
              : highlight === 'bad'  ? 'text-red-600'
              : 'text-gray-400'
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`font-display font-semibold text-lg leading-tight ${val}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subCl}`}>{sub}</p>}
    </div>
  )
}

function SpendProgressBar({
  label,
  spent,
  budget,
  color,
}: {
  label: string
  spent: number
  budget: number
  color: 'blue' | 'amber' | 'green'
}) {
  if (budget === 0) return null
  const pct = Math.min((spent / budget) * 100, 100)
  const bar = color === 'blue' ? 'bg-blue-500' : color === 'amber' ? 'bg-amber-400' : 'bg-emerald-500'
  const txt = color === 'blue' ? 'text-blue-700' : color === 'amber' ? 'text-amber-700' : 'text-emerald-700'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className={`font-semibold tabular-nums ${txt}`}>
          {fmt(spent)} <span className="font-normal text-gray-400">/ {fmt(budget)}</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs ${txt}`}>{pct.toFixed(1)}% of budget</p>
    </div>
  )
}

export function BudgetSummary({ job, lines, approvedCOTotal = 0, actualsTotal }: Props) {
  const totalRevised   = lines.reduce((s, l) => s + l.revised_budget, 0)
  const totalCommitted = lines.reduce((s, l) => s + l.committed_cost, 0)
  const totalForecast  = lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
  const variance       = totalRevised - totalForecast

  const revisedContract = (job.contract_amount ?? 0) + approvedCOTotal
  const margin          = revisedContract - totalForecast
  const marginPct       = revisedContract > 0 ? (margin / revisedContract) * 100 : 0

  const overBudgetLines = lines.filter(l => (l.forecast_cost ?? l.revised_budget) > l.revised_budget)

  return (
    <div className="space-y-3">
      {/* Over-budget alert */}
      {overBudgetLines.length > 0 && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-500 mt-0.5 flex-shrink-0">⚠</span>
          <div className="text-sm">
            <span className="font-semibold text-red-700">
              {overBudgetLines.length} line{overBudgetLines.length !== 1 ? 's' : ''} over budget
            </span>
            <span className="text-red-600 ml-2">
              {overBudgetLines.map(l => l.description).slice(0, 3).join(', ')}
              {overBudgetLines.length > 3 && ` +${overBudgetLines.length - 3} more`}
            </span>
          </div>
        </div>
      )}

      {/* Metric cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard
          label="Contract"
          value={revisedContract > 0 ? fmt(revisedContract) : (job.contract_amount != null ? fmt(job.contract_amount) : '—')}
          sub={approvedCOTotal !== 0 ? `${approvedCOTotal > 0 ? '+' : ''}${fmt(approvedCOTotal)} from COs` : undefined}
        />
        <MetricCard
          label="Budget"
          value={fmt(totalRevised)}
          sub={revisedContract > 0 ? `${((totalRevised / revisedContract) * 100).toFixed(1)}% of contract` : undefined}
        />
        <MetricCard
          label="Committed"
          value={fmt(totalCommitted)}
          sub={totalRevised > 0 ? `${((totalCommitted / totalRevised) * 100).toFixed(1)}% of budget` : undefined}
        />
        <MetricCard
          label="Actual"
          value={fmt(actualsTotal ?? 0)}
          sub={(actualsTotal != null) && totalRevised > 0
            ? `${((actualsTotal / totalRevised) * 100).toFixed(1)}% of budget`
            : undefined
          }
          highlight={(actualsTotal != null) && actualsTotal > totalRevised ? 'bad' : 'neutral'}
        />
        <MetricCard
          label="Forecast"
          value={fmt(totalForecast)}
          sub={totalRevised > 0 ? `${((totalForecast / totalRevised) * 100).toFixed(1)}% of budget` : undefined}
        />
        <MetricCard
          label="Variance"
          value={variance >= 0 ? `+${fmt(variance)}` : fmt(variance)}
          sub={variance >= 0 ? 'under budget' : 'over budget'}
          highlight={variance >= 0 ? 'good' : 'bad'}
        />
        <MetricCard
          label="Margin"
          value={(() => { const m = margin; return m >= 0 ? `+${fmt(m)}` : fmt(m) })()}
          sub={revisedContract > 0 ? `${marginPct.toFixed(1)}% margin` : undefined}
          highlight={margin >= 0 ? 'good' : 'bad'}
        />
      </div>

      {/* Spend progress bars */}
      {totalRevised > 0 && (
        <div className="bg-white rounded-xl border border-border px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SpendProgressBar
            label="Committed vs Budget"
            spent={totalCommitted}
            budget={totalRevised}
            color="blue"
          />
          <SpendProgressBar
            label="Actual vs Budget"
            spent={actualsTotal ?? 0}
            budget={totalRevised}
            color="amber"
          />
          <SpendProgressBar
            label="Forecast vs Budget"
            spent={totalForecast}
            budget={totalRevised}
            color={totalForecast > totalRevised ? 'amber' : 'green'}
          />
        </div>
      )}
    </div>
  )
}
