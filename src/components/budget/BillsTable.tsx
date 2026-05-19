'use client'

import { useState } from 'react'
import { Plus, Receipt, CheckCircle2, XCircle, Clock, CreditCard, AlertCircle } from 'lucide-react'
import type { Actual, ActualStatus, BudgetLine } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

interface StatusConfig {
  icon: React.ReactNode
  bg: string
  text: string
  label: string
}

const STATUS_CONFIG: Record<ActualStatus, StatusConfig> = {
  pending:  { icon: <Clock size={11} />,        bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Pending'  },
  approved: { icon: <CheckCircle2 size={11} />,  bg: 'bg-green-50',  text: 'text-green-700',  label: 'Approved' },
  rejected: { icon: <XCircle size={11} />,       bg: 'bg-red-50',    text: 'text-red-600',    label: 'Rejected' },
  paid:     { icon: <CreditCard size={11} />,    bg: 'bg-gray-100',  text: 'text-gray-500',   label: 'Paid'     },
}

function StatusBadge({ status }: { status: ActualStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  actuals: Actual[]
  lines: BudgetLine[]
  permissions: Permissions
  currentUserId: string
  onAdd: () => void
  onRefresh: () => void
}

export function BillsTable({ actuals, lines, permissions, onAdd, onRefresh }: Props) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lineMap = new Map(lines.map(l => [l.id, l]))

  async function updateStatus(id: string, status: ActualStatus) {
    setActionLoading(id + ':' + status)
    setError(null)
    try {
      const res = await fetch(`/api/actuals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setActionLoading(null)
    }
  }

  // Totals
  const totalPending  = actuals.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0)
  const totalApproved = actuals.filter(a => a.status === 'approved').reduce((s, a) => s + a.amount, 0)
  const totalPaid     = actuals.filter(a => a.status === 'paid').reduce((s, a) => s + a.amount, 0)

  if (actuals.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Bills</h2>
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add Bill
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <Receipt size={32} className="text-gray-200" />
          No bills recorded yet
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Add the first bill →
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
        <div>
          <h2 className="font-display font-semibold text-navy-900 text-base">
            Bills
            <span className="ml-2 text-xs font-sans font-normal text-gray-400">{actuals.length} total</span>
          </h2>
          <div className="flex gap-4 mt-1 text-xs">
            <span className="text-gray-500">
              Pending: <span className="text-amber-600 font-semibold">{fmt(totalPending)}</span>
            </span>
            <span className="text-gray-500">
              Approved: <span className="text-green-600 font-semibold">{fmt(totalApproved)}</span>
            </span>
            <span className="text-gray-500">
              Paid: <span className="text-gray-600 font-semibold">{fmt(totalPaid)}</span>
            </span>
          </div>
        </div>
        {permissions.can_create && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            Add Bill
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border-b border-red-100 px-5 py-3">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left px-5 py-3 w-28">Date</th>
              <th className="text-left px-3 py-3 w-40">Vendor</th>
              <th className="text-left px-3 py-3 w-28">Invoice #</th>
              <th className="text-left px-3 py-3">Description</th>
              <th className="text-left px-3 py-3 w-40">Budget Line</th>
              <th className="text-right px-3 py-3 w-28">Amount</th>
              <th className="text-left px-3 py-3 w-28">Status</th>
              {permissions.can_edit && (
                <th className="text-left px-5 py-3 w-48">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {actuals.map(actual => {
              const line = actual.budget_line_id ? lineMap.get(actual.budget_line_id) : undefined
              const isLoading = (s: ActualStatus) => actionLoading === `${actual.id}:${s}`

              return (
                <tr key={actual.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                    {fmtDate(actual.incurred_date)}
                  </td>
                  <td className="px-3 py-3 text-navy-800 font-medium truncate max-w-[160px]">
                    {actual.vendor_name ?? <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs font-mono text-gray-500">
                    {actual.invoice_number ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-navy-800 font-medium truncate max-w-[200px]">{actual.description}</p>
                    {actual.status === 'approved' && actual.approved_at && (
                      <p className="text-[10px] text-green-600 mt-0.5">
                        Approved {fmtDate(actual.approved_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 truncate max-w-[160px]">
                    {line
                      ? <span>{line.cost_code} · {line.description}</span>
                      : <span className="text-gray-300 italic">Unassigned</span>
                    }
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-navy-900 tabular-nums">
                    {fmt(actual.amount)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={actual.status} />
                  </td>
                  {permissions.can_edit && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {actual.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(actual.id, 'approved')}
                              disabled={!!actionLoading}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-[11px] font-semibold rounded transition-colors"
                            >
                              {isLoading('approved') ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => updateStatus(actual.id, 'rejected')}
                              disabled={!!actionLoading}
                              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-[11px] font-semibold rounded transition-colors"
                            >
                              {isLoading('rejected') ? '…' : 'Reject'}
                            </button>
                          </>
                        )}
                        {actual.status === 'approved' && (
                          <button
                            onClick={() => updateStatus(actual.id, 'paid')}
                            disabled={!!actionLoading}
                            className="px-2.5 py-1 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-[11px] font-semibold rounded transition-colors"
                          >
                            {isLoading('paid') ? '…' : 'Mark Paid'}
                          </button>
                        )}
                        {actual.status === 'rejected' && (
                          <button
                            onClick={() => updateStatus(actual.id, 'pending')}
                            disabled={!!actionLoading}
                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-[11px] font-semibold rounded transition-colors"
                          >
                            {isLoading('pending') ? '…' : 'Resubmit'}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-navy-900">
              <td colSpan={5} className="px-5 py-3 text-xs text-gray-500 font-medium">TOTALS</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {fmt(actuals.reduce((s, a) => s + a.amount, 0))}
              </td>
              <td colSpan={permissions.can_edit ? 2 : 1} className="px-3 py-3">
                <div className="flex gap-3 text-xs font-normal">
                  <span className="text-amber-600">Pending: {fmt(totalPending)}</span>
                  <span className="text-green-600">Approved: {fmt(totalApproved)}</span>
                  <span className="text-gray-500">Paid: {fmt(totalPaid)}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {actuals.map(actual => {
          const line = actual.budget_line_id ? lineMap.get(actual.budget_line_id) : undefined
          const isLoading = (s: ActualStatus) => actionLoading === `${actual.id}:${s}`

          return (
            <div key={actual.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-800 leading-snug truncate">{actual.description}</p>
                  {actual.vendor_name && (
                    <p className="text-xs text-gray-500 mt-0.5">{actual.vendor_name}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fmtDate(actual.incurred_date)}
                    {actual.invoice_number && ` · #${actual.invoice_number}`}
                  </p>
                  {line && (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {line.cost_code} · {line.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={actual.status} />
                  <span className="text-sm font-semibold text-navy-900 tabular-nums">{fmt(actual.amount)}</span>
                </div>
              </div>

              {permissions.can_edit && (
                <div className="flex items-center gap-1.5 mt-2">
                  {actual.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(actual.id, 'approved')}
                        disabled={!!actionLoading}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                      >
                        {isLoading('approved') ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => updateStatus(actual.id, 'rejected')}
                        disabled={!!actionLoading}
                        className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs font-semibold rounded transition-colors"
                      >
                        {isLoading('rejected') ? '…' : 'Reject'}
                      </button>
                    </>
                  )}
                  {actual.status === 'approved' && (
                    <button
                      onClick={() => updateStatus(actual.id, 'paid')}
                      disabled={!!actionLoading}
                      className="px-3 py-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                    >
                      {isLoading('paid') ? '…' : 'Mark Paid'}
                    </button>
                  )}
                  {actual.status === 'rejected' && (
                    <button
                      onClick={() => updateStatus(actual.id, 'pending')}
                      disabled={!!actionLoading}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-semibold rounded transition-colors"
                    >
                      {isLoading('pending') ? '…' : 'Resubmit'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Mobile totals */}
        <div className="px-4 py-3 bg-gray-50 border-t-2 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Totals</span>
            <span className="text-sm font-semibold text-navy-900 tabular-nums">
              {fmt(actuals.reduce((s, a) => s + a.amount, 0))}
            </span>
          </div>
          <div className="flex gap-3 mt-1 text-xs">
            <span className="text-amber-600">Pending: {fmt(totalPending)}</span>
            <span className="text-green-600">Approved: {fmt(totalApproved)}</span>
            <span className="text-gray-500">Paid: {fmt(totalPaid)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
