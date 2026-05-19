'use client'

import Link from 'next/link'
import type { Job, BudgetLine, Actual, ChangeOrder } from '@/types'

interface Props {
  job: Pick<Job, 'id' | 'name' | 'contract_amount' | 'estimated_cost' | 'status'>
  lines: BudgetLine[]
  actuals: Actual[]
  changeOrders: ChangeOrder[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtSigned = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n))

export function ProfitabilityClient({ job, lines, actuals, changeOrders }: Props) {
  // ── Revenue ──────────────────────────────────────────────────────────────
  const originalContract = job.contract_amount ?? 0

  const approvedCOs = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => {
      if (co.type === 'additive') return sum + co.amount
      if (co.type === 'deductive') return sum - co.amount
      return sum
    }, 0)

  const revisedContract = originalContract + approvedCOs

  // ── Cost ─────────────────────────────────────────────────────────────────
  const totalBudget     = lines.reduce((s, l) => s + l.revised_budget, 0)
  const totalCommitted  = lines.reduce((s, l) => s + l.committed_cost, 0)
  const totalForecast   = lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
  const variance        = totalBudget - totalForecast

  const totalActual = actuals
    .filter(a => a.status === 'approved' || a.status === 'paid')
    .reduce((s, a) => s + a.amount, 0)

  const pendingActualsTotal = actuals
    .filter(a => a.status === 'pending')
    .reduce((s, a) => s + a.amount, 0)

  // ── Profitability ─────────────────────────────────────────────────────────
  const grossProfit = revisedContract - totalForecast
  const grossMargin = revisedContract > 0 ? (grossProfit / revisedContract) * 100 : 0

  const marginColor =
    grossMargin >= 15
      ? 'text-green-700'
      : grossMargin >= 5
      ? 'text-amber-600'
      : 'text-red-700'

  const marginBg =
    grossMargin >= 15
      ? 'bg-green-50 border-green-200'
      : grossMargin >= 5
      ? 'bg-amber-50 border-amber-200'
      : 'bg-red-50 border-red-200'

  // ── Actuals breakdown ─────────────────────────────────────────────────────
  const pendingActuals  = actuals.filter(a => a.status === 'pending')
  const approvedActuals = actuals.filter(a => a.status === 'approved')
  const paidActuals     = actuals.filter(a => a.status === 'paid')

  const openCOs = changeOrders.filter(
    co => co.status === 'submitted' || co.status === 'draft',
  )

  // ── By Category breakdown ─────────────────────────────────────────────────
  const categoryMap = new Map<
    string,
    { budget: number; committed: number; actual: number; forecast: number }
  >()

  for (const line of lines) {
    const cat = line.category || 'Uncategorized'
    const existing = categoryMap.get(cat) ?? { budget: 0, committed: 0, actual: 0, forecast: 0 }
    const lineActual = actuals
      .filter(a => a.budget_line_id === line.id && (a.status === 'approved' || a.status === 'paid'))
      .reduce((s, a) => s + a.amount, 0)

    categoryMap.set(cat, {
      budget:    existing.budget    + line.revised_budget,
      committed: existing.committed + line.committed_cost,
      actual:    existing.actual    + lineActual,
      forecast:  existing.forecast  + (line.forecast_cost ?? line.revised_budget),
    })
  }

  const categories = Array.from(categoryMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  const totals = categories.reduce(
    (acc, [, v]) => ({
      budget:    acc.budget    + v.budget,
      committed: acc.committed + v.committed,
      actual:    acc.actual    + v.actual,
      forecast:  acc.forecast  + v.forecast,
    }),
    { budget: 0, committed: 0, actual: 0, forecast: 0 },
  )

  return (
    <div className="space-y-6">

      {/* ── Section 1: Revenue Summary ──────────────────────────────────── */}
      <div>
        <h2 className="font-display font-semibold text-navy-900 text-base mb-3">Revenue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Original Contract</p>
            <p className="font-display font-semibold text-lg text-navy-900">{fmt(originalContract)}</p>
          </div>

          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Approved Change Orders</p>
            <p className={`font-display font-semibold text-lg ${approvedCOs >= 0 ? 'text-navy-900' : 'text-red-700'}`}>
              {approvedCOs === 0 ? fmt(0) : fmtSigned(approvedCOs)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {changeOrders.filter(co => co.status === 'approved').length} approved
            </p>
          </div>

          <div className={`rounded-xl border px-4 py-3 ${revisedContract > originalContract ? 'bg-amber-50 border-amber-300' : 'bg-white border-border'}`}>
            <p className={`text-xs font-medium mb-1 ${revisedContract > originalContract ? 'text-amber-700' : 'text-gray-500'}`}>
              Revised Contract
            </p>
            <p className={`font-display font-semibold text-lg ${revisedContract > originalContract ? 'text-amber-700' : 'text-navy-900'}`}>
              {fmt(revisedContract)}
            </p>
            {approvedCOs !== 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {approvedCOs > 0 ? '+' : ''}{fmt(approvedCOs)} from COs
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2: Cost Summary ─────────────────────────────────────── */}
      <div>
        <h2 className="font-display font-semibold text-navy-900 text-base mb-3">Cost</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Budget</p>
            <p className="font-display font-semibold text-lg text-navy-900">{fmt(totalBudget)}</p>
            <p className="text-xs text-gray-400 mt-0.5">revised budget</p>
          </div>

          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Committed</p>
            <p className="font-display font-semibold text-lg text-navy-900">{fmt(totalCommitted)}</p>
            {totalBudget > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {((totalCommitted / totalBudget) * 100).toFixed(0)}% of budget
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Actual</p>
            <p className="font-display font-semibold text-lg text-navy-900">{fmt(totalActual)}</p>
            {totalBudget > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {((totalActual / totalBudget) * 100).toFixed(0)}% of budget
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Forecast</p>
            <p className="font-display font-semibold text-lg text-navy-900">{fmt(totalForecast)}</p>
            {totalBudget > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {((totalForecast / totalBudget) * 100).toFixed(0)}% of budget
              </p>
            )}
          </div>

          <div className={`rounded-xl border px-4 py-3 ${variance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-xs font-medium mb-1 ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Variance
            </p>
            <p className={`font-display font-semibold text-lg ${variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtSigned(variance)}
            </p>
            <p className={`text-xs mt-0.5 ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {variance >= 0 ? 'under budget' : 'over budget'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 3: Profitability ─────────────────────────────────────── */}
      <div>
        <h2 className="font-display font-semibold text-navy-900 text-base mb-3">Profitability</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`rounded-xl border px-5 py-4 ${marginBg}`}>
            <p className={`text-xs font-medium mb-1.5 ${marginColor}`}>Gross Profit</p>
            <p className={`font-display font-bold text-2xl ${marginColor}`}>
              {fmtSigned(grossProfit)}
            </p>
            <p className={`text-xs mt-1 ${marginColor} opacity-75`}>
              Revised Contract − Forecast Cost
            </p>
          </div>

          <div className={`rounded-xl border px-5 py-4 ${marginBg}`}>
            <p className={`text-xs font-medium mb-1.5 ${marginColor}`}>Gross Margin</p>
            <p className={`font-display font-bold text-2xl ${marginColor}`}>
              {grossMargin.toFixed(1)}%
            </p>
            <p className={`text-xs mt-1 ${marginColor} opacity-75`}>
              {grossMargin >= 15
                ? 'Healthy margin'
                : grossMargin >= 5
                ? 'Thin margin — monitor closely'
                : 'At risk — review costs'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-border px-5 py-4">
            <p className="text-xs text-gray-500 font-medium mb-1.5">Pending Exposure</p>
            <p className="font-display font-bold text-2xl text-amber-600">
              {fmt(pendingActualsTotal)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {pendingActuals.length} pending {pendingActuals.length === 1 ? 'bill' : 'bills'} not yet approved
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 4: By Category Breakdown ────────────────────────────── */}
      <div>
        <h2 className="font-display font-semibold text-navy-900 text-base mb-3">By Category</h2>
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm gap-2">
              No budget lines yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Category</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Budget</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Committed</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Actual</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Forecast</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map(([category, v]) => {
                    const catVariance = v.budget - v.forecast
                    return (
                      <tr key={category} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/jobs/${job.id}/budget`}
                            className="font-medium text-navy-800 hover:text-gold-600 transition-colors"
                          >
                            {category}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right text-navy-700 tabular-nums">{fmt(v.budget)}</td>
                        <td className="px-4 py-2.5 text-right text-navy-700 tabular-nums">{fmt(v.committed)}</td>
                        <td className="px-4 py-2.5 text-right text-navy-700 tabular-nums">{fmt(v.actual)}</td>
                        <td className="px-4 py-2.5 text-right text-navy-700 tabular-nums">{fmt(v.forecast)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${catVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmtSigned(catVariance)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5 text-navy-900 text-xs font-semibold uppercase tracking-wide">Total</td>
                    <td className="px-4 py-2.5 text-right text-navy-900 tabular-nums">{fmt(totals.budget)}</td>
                    <td className="px-4 py-2.5 text-right text-navy-900 tabular-nums">{fmt(totals.committed)}</td>
                    <td className="px-4 py-2.5 text-right text-navy-900 tabular-nums">{fmt(totals.actual)}</td>
                    <td className="px-4 py-2.5 text-right text-navy-900 tabular-nums">{fmt(totals.forecast)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${(totals.budget - totals.forecast) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtSigned(totals.budget - totals.forecast)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Status Indicators ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Actuals breakdown */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="font-display font-semibold text-navy-900 text-sm mb-3">Bills &amp; Actuals</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-gray-600">Pending</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-navy-800">{pendingActuals.length}</span>
                <span className="text-gray-400 ml-2 text-xs">{fmt(pendingActualsTotal)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-gray-600">Approved</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-navy-800">{approvedActuals.length}</span>
                <span className="text-gray-400 ml-2 text-xs">
                  {fmt(approvedActuals.reduce((s, a) => s + a.amount, 0))}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-gray-600">Paid</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-navy-800">{paidActuals.length}</span>
                <span className="text-gray-400 ml-2 text-xs">
                  {fmt(paidActuals.reduce((s, a) => s + a.amount, 0))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Open change orders */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="font-display font-semibold text-navy-900 text-sm mb-3">Change Orders</h3>
          {openCOs.length === 0 ? (
            <p className="text-sm text-gray-400">No open change orders</p>
          ) : (
            <div className="space-y-2">
              {openCOs.map(co => (
                <div key={co.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${co.status === 'submitted' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    <span className="text-navy-700 truncate">{co.title}</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className={`font-medium ${co.type === 'deductive' ? 'text-red-600' : 'text-navy-800'}`}>
                      {co.type === 'deductive' ? '-' : co.type === 'additive' ? '+' : ''}{fmt(co.amount)}
                    </span>
                    <span className="text-gray-400 ml-1.5 text-xs capitalize">{co.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>{openCOs.filter(c => c.status === 'submitted').length} submitted / pending approval</span>
            <Link href={`/jobs/${job.id}/budget`} className="text-gold-600 hover:text-gold-700 font-medium">
              View all →
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}
