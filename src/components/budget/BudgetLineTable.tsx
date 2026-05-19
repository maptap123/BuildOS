'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Receipt } from 'lucide-react'
import type { BudgetLine, Actual, BudgetLineStatus, ActualStatus } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const LINE_STATUS_STYLES: Record<BudgetLineStatus, string> = {
  draft:         'bg-gray-100 text-gray-600',
  approved:      'bg-blue-50 text-blue-700',
  change_order:  'bg-amber-50 text-amber-700',
  closed:        'bg-green-50 text-green-700',
}

const ACTUAL_STATUS_STYLES: Record<ActualStatus, string> = {
  pending:  'bg-gray-100 text-gray-500',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-600',
  paid:     'bg-green-50 text-green-700',
}

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  lines: BudgetLine[]
  actuals: Actual[]
  permissions: Permissions
  onAddLine: () => void
  onAddActual: (lineId: string) => void
}

function StatusBadge({ status }: { status: BudgetLineStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${LINE_STATUS_STYLES[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function ActualStatusBadge({ status }: { status: ActualStatus }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ACTUAL_STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function VarianceCell({ revised, forecast }: { revised: number; forecast: number }) {
  const v = revised - forecast
  const color = v >= 0 ? 'text-green-600' : 'text-red-600'
  return (
    <span className={`font-medium ${color}`}>
      {v >= 0 ? '+' : ''}{fmt(v)}
    </span>
  )
}

function ActualsList({
  lineId,
  actuals,
  canCreate,
  onAddActual,
}: {
  lineId: string
  actuals: Actual[]
  canCreate: boolean
  onAddActual: () => void
}) {
  const lineActuals = actuals.filter(a => a.budget_line_id === lineId)

  return (
    <div className="bg-gray-50 rounded-b-lg border-t border-gray-100 px-4 py-3">
      {lineActuals.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No actuals recorded</p>
      ) : (
        <div className="space-y-2 mb-3">
          {lineActuals.map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-navy-800 font-medium truncate">{a.description}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {a.vendor_name && <span>{a.vendor_name} · </span>}
                  {new Date(a.incurred_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {a.invoice_number && <span> · #{a.invoice_number}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ActualStatusBadge status={a.status} />
                <span className="font-semibold text-navy-900 tabular-nums">{fmt(a.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {canCreate && (
        <button
          onClick={onAddActual}
          className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium transition-colors"
        >
          <Plus size={12} />
          Add Actual
        </button>
      )}
    </div>
  )
}

export function BudgetLineTable({ lines, actuals, permissions, onAddLine, onAddActual }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (lines.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Budget Lines</h2>
          {permissions.can_create && (
            <button
              onClick={onAddLine}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add Line
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <Receipt size={32} className="text-gray-200" />
          No budget lines yet
          {permissions.can_create && (
            <button
              onClick={onAddLine}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Add the first line →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-display font-semibold text-navy-900 text-base">
          Budget Lines
          <span className="ml-2 text-xs font-sans font-normal text-gray-400">{lines.length} items</span>
        </h2>
        {permissions.can_create && (
          <button
            onClick={onAddLine}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            Add Line
          </button>
        )}
      </div>

      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left px-5 py-3 w-24">Code</th>
              <th className="text-left px-3 py-3 w-32">Category</th>
              <th className="text-left px-3 py-3">Description</th>
              <th className="text-left px-3 py-3 w-28">Status</th>
              <th className="text-right px-3 py-3 w-28">Original</th>
              <th className="text-right px-3 py-3 w-28">Revised</th>
              <th className="text-right px-3 py-3 w-28">Committed</th>
              <th className="text-right px-3 py-3 w-28">Forecast</th>
              <th className="text-right px-5 py-3 w-28">Variance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => {
              const isExpanded = expandedId === line.id
              const lineActuals = actuals.filter(a => a.budget_line_id === line.id)
              const forecast = line.forecast_cost ?? line.revised_budget

              return (
                <Fragment key={line.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : line.id)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{line.cost_code}</td>
                    <td className="px-3 py-3 text-gray-600 text-xs">{line.category}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-navy-800 font-medium">{line.description}</span>
                        {lineActuals.length > 0 && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {lineActuals.length} actual{lineActuals.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={line.status} /></td>
                    <td className="px-3 py-3 text-right text-gray-400 tabular-nums">{fmt(line.original_budget)}</td>
                    <td className="px-3 py-3 text-right text-navy-700 tabular-nums">{fmt(line.revised_budget)}</td>
                    <td className="px-3 py-3 text-right text-navy-700 tabular-nums">{fmt(line.committed_cost)}</td>
                    <td className="px-3 py-3 text-right text-navy-700 tabular-nums">{fmt(forecast)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <VarianceCell revised={line.revised_budget} forecast={forecast} />
                        {isExpanded
                          ? <ChevronDown size={14} className="text-gray-400" />
                          : <ChevronRight size={14} className="text-gray-300" />
                        }
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="p-0">
                        <ActualsList
                          lineId={line.id}
                          actuals={actuals}
                          canCreate={permissions.can_create}
                          onAddActual={() => onAddActual(line.id)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-navy-900">
              <td colSpan={4} className="px-5 py-3 text-xs text-gray-500 font-medium">TOTALS</td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-400">
                {fmt(lines.reduce((s, l) => s + l.original_budget, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(lines.reduce((s, l) => s + l.revised_budget, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(lines.reduce((s, l) => s + l.committed_cost, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0))}
              </td>
              <td className="px-5 py-3 text-right tabular-nums">
                <VarianceCell
                  revised={lines.reduce((s, l) => s + l.revised_budget, 0)}
                  forecast={lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)}
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card list — hidden on desktop */}
      <div className="md:hidden divide-y divide-gray-100">
        {lines.map(line => {
          const isExpanded = expandedId === line.id
          const lineActuals = actuals.filter(a => a.budget_line_id === line.id)
          const forecast = line.forecast_cost ?? line.revised_budget

          return (
            <div key={line.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : line.id)}
                className="w-full text-left px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-gray-400 mb-0.5">{line.cost_code} · {line.category}</p>
                    <p className="text-sm font-medium text-navy-800 leading-snug">{line.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={line.status} />
                    {isExpanded
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-300" />
                    }
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Budget</p>
                    <p className="text-sm font-semibold text-navy-800 tabular-nums">{fmt(line.revised_budget)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Forecast</p>
                    <p className="text-sm font-semibold text-navy-800 tabular-nums">{fmt(forecast)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Variance</p>
                    <p className="text-sm tabular-nums">
                      <VarianceCell revised={line.revised_budget} forecast={forecast} />
                    </p>
                  </div>
                </div>

                {lineActuals.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    {lineActuals.length} actual{lineActuals.length !== 1 ? 's' : ''} · committed {fmt(line.committed_cost)}
                  </p>
                )}
              </button>

              {isExpanded && (
                <ActualsList
                  lineId={line.id}
                  actuals={actuals}
                  canCreate={permissions.can_create}
                  onAddActual={() => onAddActual(line.id)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
