'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Receipt, Pencil, Search, X, AlertTriangle } from 'lucide-react'
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
  onEdit?: (line: BudgetLine) => void
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

function SpendBar({ committed, revised }: { committed: number; revised: number }) {
  if (revised === 0) return null
  const pct = (committed / revised) * 100
  const clampedPct = Math.min(pct, 100)
  const barColor =
    pct > 100 ? 'bg-red-500' :
    pct > 85  ? 'bg-amber-400' :
    pct > 60  ? 'bg-gold-400' :
                'bg-emerald-400'
  const textColor = pct > 100 ? 'text-red-500' : 'text-gray-400'
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums font-medium ${textColor}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
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
    <div className="bg-gray-50 border-t border-gray-100 px-6 py-3">
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

// ─── Phase group section ──────────────────────────────────────────────────────

interface PhaseGroupProps {
  phase: string
  phaseLines: BudgetLine[]
  actuals: Actual[]
  permissions: Permissions
  expandedId: string | null
  onToggle: (id: string) => void
  onAddActual: (lineId: string) => void
  onEdit?: (line: BudgetLine) => void
}

function PhaseGroup({ phase, phaseLines, actuals, permissions, expandedId, onToggle, onAddActual, onEdit }: PhaseGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  const phaseBudget    = phaseLines.reduce((s, l) => s + l.revised_budget, 0)
  const phaseCommitted = phaseLines.reduce((s, l) => s + l.committed_cost, 0)
  const phaseForecast  = phaseLines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
  const phaseVariance  = phaseBudget - phaseForecast
  const overBudgetCount = phaseLines.filter(l => (l.forecast_cost ?? l.revised_budget) > l.revised_budget).length

  const colCount = permissions.can_edit ? 10 : 9

  return (
    <>
      {/* Phase header row */}
      <tr
        onClick={() => setCollapsed(c => !c)}
        className="bg-navy-950/[0.03] border-b border-gray-200 cursor-pointer hover:bg-navy-950/[0.06] transition-colors select-none"
      >
        <td colSpan={colCount} className="px-5 py-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400 flex-shrink-0">
                {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </span>
              <span className="text-xs font-bold text-navy-800 uppercase tracking-wider">{phase}</span>
              <span className="text-xs text-gray-400 font-normal">
                {phaseLines.length} line{phaseLines.length !== 1 ? 's' : ''}
              </span>
              {overBudgetCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  <AlertTriangle size={9} />
                  {overBudgetCount} over budget
                </span>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-5 text-xs flex-shrink-0">
              <span className="text-gray-500">
                Budget <span className="font-semibold text-navy-700 ml-1">{fmt(phaseBudget)}</span>
              </span>
              <span className="text-gray-500">
                Committed <span className="font-semibold text-navy-700 ml-1">{fmt(phaseCommitted)}</span>
              </span>
              <span className="text-gray-500">
                Variance{' '}
                <span className={`font-semibold ml-1 ${phaseVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {phaseVariance >= 0 ? '+' : ''}{fmt(phaseVariance)}
                </span>
              </span>
            </div>
          </div>
        </td>
      </tr>

      {/* Lines within phase */}
      {!collapsed && phaseLines.map(line => {
        const isExpanded = expandedId === line.id
        const lineActuals = actuals.filter(a => a.budget_line_id === line.id)
        const forecast = line.forecast_cost ?? line.revised_budget
        const isOverBudget = forecast > line.revised_budget

        return (
          <Fragment key={line.id}>
            <tr
              onClick={() => onToggle(line.id)}
              className={`border-b border-gray-50 cursor-pointer transition-colors ${
                isOverBudget ? 'bg-red-50/50 hover:bg-red-50/80' : 'hover:bg-gray-50'
              }`}
            >
              <td className="px-5 py-3 font-mono text-xs text-gray-500">{line.cost_code}</td>
              <td className="px-3 py-3 text-gray-600 text-xs">{line.category}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${isOverBudget ? 'text-red-800' : 'text-navy-800'}`}>
                    {line.description}
                  </span>
                  {isOverBudget && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
                  {lineActuals.length > 0 && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {lineActuals.length} actual{lineActuals.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <SpendBar committed={line.committed_cost} revised={line.revised_budget} />
              </td>
              <td className="px-3 py-3"><StatusBadge status={line.status} /></td>
              <td className="px-3 py-3 text-right text-gray-400 tabular-nums text-sm">{fmt(line.original_budget)}</td>
              <td className="px-3 py-3 text-right text-navy-700 tabular-nums text-sm">{fmt(line.revised_budget)}</td>
              <td className="px-3 py-3 text-right text-navy-700 tabular-nums text-sm">{fmt(line.committed_cost)}</td>
              <td className={`px-3 py-3 text-right tabular-nums text-sm font-medium ${isOverBudget ? 'text-red-700' : 'text-navy-700'}`}>
                {fmt(forecast)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                <div className="flex items-center justify-end gap-2">
                  <VarianceCell revised={line.revised_budget} forecast={forecast} />
                  {isExpanded
                    ? <ChevronDown size={14} className="text-gray-400" />
                    : <ChevronRight size={14} className="text-gray-300" />
                  }
                </div>
              </td>
              {permissions.can_edit && (
                <td className="px-5 py-3">
                  <button
                    onClick={e => { e.stopPropagation(); onEdit?.(line) }}
                    className="text-gray-300 hover:text-gold-500 transition-colors"
                    title="Edit line"
                  >
                    <Pencil size={13} />
                  </button>
                </td>
              )}
            </tr>
            {isExpanded && (
              <tr>
                <td colSpan={colCount} className="p-0">
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
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BudgetLineTable({ lines, actuals, permissions, onAddLine, onAddActual, onEdit }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BudgetLineStatus | 'all'>('all')

  const filtered = useMemo(() => {
    let result = lines
    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.description.toLowerCase().includes(q) ||
        l.cost_code.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.phase?.toLowerCase().includes(q) ?? false)
      )
    }
    return result
  }, [lines, search, statusFilter])

  // Group by phase — preserve insertion order
  const phases = useMemo(() => {
    const phaseMap = new Map<string, BudgetLine[]>()
    for (const line of filtered) {
      const key = line.phase ?? 'No Phase'
      if (!phaseMap.has(key)) phaseMap.set(key, [])
      phaseMap.get(key)!.push(line)
    }
    return Array.from(phaseMap.entries())
  }, [filtered])

  const hasPhases = useMemo(() =>
    lines.some(l => l.phase != null && l.phase.trim() !== ''),
  [lines])

  function toggleExpanded(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  const colCount = permissions.can_edit ? 10 : 9

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

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search code, description, phase…"
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as BudgetLineStatus | 'all')}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-900/20 bg-white text-gray-600"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="change_order">Change Order</option>
          <option value="closed">Closed</option>
        </select>
        {(search || statusFilter !== 'all') && (
          <span className="text-xs text-gray-400">
            {filtered.length} of {lines.length} lines
          </span>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left px-5 py-3 w-24">Code</th>
              <th className="text-left px-3 py-3 w-28">Category</th>
              <th className="text-left px-3 py-3">Description / Spend</th>
              <th className="text-left px-3 py-3 w-28">Status</th>
              <th className="text-right px-3 py-3 w-28">Original</th>
              <th className="text-right px-3 py-3 w-28">Revised</th>
              <th className="text-right px-3 py-3 w-28">Committed</th>
              <th className="text-right px-3 py-3 w-28">Forecast</th>
              <th className="text-right px-3 py-3 w-28">Variance</th>
              {permissions.can_edit && <th className="px-5 py-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-5 py-10 text-center text-sm text-gray-400">
                  No lines match your search
                </td>
              </tr>
            ) : hasPhases ? (
              phases.map(([phase, phaseLines]) => (
                <PhaseGroup
                  key={phase}
                  phase={phase}
                  phaseLines={phaseLines}
                  actuals={actuals}
                  permissions={permissions}
                  expandedId={expandedId}
                  onToggle={toggleExpanded}
                  onAddActual={onAddActual}
                  onEdit={onEdit}
                />
              ))
            ) : (
              // No phase data — flat list
              filtered.map(line => {
                const isExpanded = expandedId === line.id
                const lineActuals = actuals.filter(a => a.budget_line_id === line.id)
                const forecast = line.forecast_cost ?? line.revised_budget
                const isOverBudget = forecast > line.revised_budget

                return (
                  <Fragment key={line.id}>
                    <tr
                      onClick={() => toggleExpanded(line.id)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${
                        isOverBudget ? 'bg-red-50/50 hover:bg-red-50/80' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{line.cost_code}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{line.category}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${isOverBudget ? 'text-red-800' : 'text-navy-800'}`}>
                            {line.description}
                          </span>
                          {isOverBudget && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
                          {lineActuals.length > 0 && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              {lineActuals.length} actual{lineActuals.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <SpendBar committed={line.committed_cost} revised={line.revised_budget} />
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={line.status} /></td>
                      <td className="px-3 py-3 text-right text-gray-400 tabular-nums">{fmt(line.original_budget)}</td>
                      <td className="px-3 py-3 text-right text-navy-700 tabular-nums">{fmt(line.revised_budget)}</td>
                      <td className="px-3 py-3 text-right text-navy-700 tabular-nums">{fmt(line.committed_cost)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums font-medium ${isOverBudget ? 'text-red-700' : 'text-navy-700'}`}>
                        {fmt(forecast)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <VarianceCell revised={line.revised_budget} forecast={forecast} />
                          {isExpanded
                            ? <ChevronDown size={14} className="text-gray-400" />
                            : <ChevronRight size={14} className="text-gray-300" />
                          }
                        </div>
                      </td>
                      {permissions.can_edit && (
                        <td className="px-5 py-3">
                          <button
                            onClick={e => { e.stopPropagation(); onEdit?.(line) }}
                            className="text-gray-300 hover:text-gold-500 transition-colors"
                            title="Edit line"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="p-0">
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
              })
            )}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-navy-900">
              <td colSpan={4} className="px-5 py-3 text-xs text-gray-500 font-medium">TOTALS</td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-400">
                {fmt(filtered.reduce((s, l) => s + l.original_budget, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(filtered.reduce((s, l) => s + l.revised_budget, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(filtered.reduce((s, l) => s + l.committed_cost, 0))}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(filtered.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0))}
              </td>
              <td className={`px-3 py-3 text-right tabular-nums${permissions.can_edit ? '' : ' pr-5'}`}>
                <VarianceCell
                  revised={filtered.reduce((s, l) => s + l.revised_budget, 0)}
                  forecast={filtered.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)}
                />
              </td>
              {permissions.can_edit && <td className="px-5 py-3" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No lines match your search
          </div>
        ) : filtered.map(line => {
          const isExpanded = expandedId === line.id
          const lineActuals = actuals.filter(a => a.budget_line_id === line.id)
          const forecast = line.forecast_cost ?? line.revised_budget
          const isOverBudget = forecast > line.revised_budget

          return (
            <div key={line.id} className={isOverBudget ? 'bg-red-50/40' : ''}>
              <button
                onClick={() => toggleExpanded(line.id)}
                className="w-full text-left px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-gray-400 mb-0.5">
                      {line.cost_code} · {line.category}
                      {line.phase && <span className="ml-1 uppercase tracking-wider">· {line.phase}</span>}
                    </p>
                    <p className={`text-sm font-medium leading-snug ${isOverBudget ? 'text-red-800' : 'text-navy-800'}`}>
                      {line.description}
                      {isOverBudget && <AlertTriangle size={11} className="inline ml-1.5 text-red-400" />}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={line.status} />
                    {permissions.can_edit && (
                      <button
                        onClick={e => { e.stopPropagation(); onEdit?.(line) }}
                        className="text-gray-300 hover:text-gold-500 transition-colors"
                        title="Edit line"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {isExpanded
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-300" />
                    }
                  </div>
                </div>

                <SpendBar committed={line.committed_cost} revised={line.revised_budget} />

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Budget</p>
                    <p className="text-sm font-semibold text-navy-800 tabular-nums">{fmt(line.revised_budget)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Forecast</p>
                    <p className={`text-sm font-semibold tabular-nums ${isOverBudget ? 'text-red-600' : 'text-navy-800'}`}>
                      {fmt(forecast)}
                    </p>
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
