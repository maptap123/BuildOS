'use client'

import { useState } from 'react'
import {
  Plus, AlertCircle, FileEdit, Send, PackageCheck, CheckCircle2, Ban, Trash2,
} from 'lucide-react'
import type { PurchaseOrder, POStatus } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '—'

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  POStatus,
  { icon: React.ReactNode; bg: string; text: string; label: string; strikethrough?: boolean }
> = {
  draft:     { icon: <FileEdit size={11} />,      bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Draft'     },
  sent:      { icon: <Send size={11} />,           bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Sent'      },
  received:  { icon: <PackageCheck size={11} />,   bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Received'  },
  closed:    { icon: <CheckCircle2 size={11} />,   bg: 'bg-green-50',   text: 'text-green-700',  label: 'Closed'    },
  cancelled: { icon: <Ban size={11} />,            bg: 'bg-red-50',     text: 'text-red-600',    label: 'Cancelled', strikethrough: true },
}

function StatusBadge({ status }: { status: POStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  pos: PurchaseOrder[]
  permissions: Permissions
  onAdd: () => void
  onEdit: (po: PurchaseOrder) => void
  onDelete?: (po: PurchaseOrder) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseOrderTable({ pos, permissions, onAdd, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<POStatus | 'all'>('all')

  const totalCommitted = pos
    .filter(p => p.status !== 'cancelled')
    .reduce((s, p) => s + p.amount, 0)

  const filtered = filter === 'all' ? pos : pos.filter(p => p.status === filter)

  const filterTabs: { key: POStatus | 'all'; label: string }[] = [
    { key: 'all',      label: `All (${pos.length})` },
    { key: 'draft',    label: 'Draft'    },
    { key: 'sent',     label: 'Sent'     },
    { key: 'received', label: 'Received' },
    { key: 'closed',   label: 'Closed'   },
    { key: 'cancelled',label: 'Cancelled'},
  ]

  if (pos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Purchase Orders</h2>
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              New PO
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <AlertCircle size={32} className="text-gray-200" />
          No purchase orders yet
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Create the first purchase order →
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
            Purchase Orders
            <span className="ml-2 text-xs font-sans font-normal text-gray-400">{pos.length} total</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Committed: <span className="font-semibold text-navy-800">{fmt(totalCommitted)}</span>
          </p>
        </div>
        {permissions.can_create && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            New PO
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 py-2 border-b border-gray-100 overflow-x-auto">
        {filterTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              filter === t.key
                ? 'bg-navy-900 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left px-5 py-3 w-28">PO #</th>
              <th className="text-left px-3 py-3">Vendor</th>
              <th className="text-left px-3 py-3">Description</th>
              <th className="text-left px-3 py-3">Budget Line</th>
              <th className="text-right px-3 py-3 w-32">Amount</th>
              <th className="text-left px-3 py-3 w-28">Status</th>
              <th className="text-left px-3 py-3 w-28">Issued</th>
              {(permissions.can_edit || permissions.can_delete) && (
                <th className="text-left px-5 py-3 w-20">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(po => {
              const isCancelled = po.status === 'cancelled'
              const rowClass = `border-b border-gray-50 hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`
              return (
                <tr key={po.id} className={rowClass}>
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-navy-700">
                    {po.po_number ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 font-medium text-navy-800 max-w-[140px] truncate">
                    <span className={isCancelled ? 'line-through text-gray-400' : ''}>{po.vendor_name}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 max-w-[200px] truncate">
                    <span className={isCancelled ? 'line-through text-gray-400' : ''}>{po.description}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                    {po.budget_lines
                      ? `${po.budget_lines.cost_code} · ${po.budget_lines.description}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-navy-900'}`}>
                    {fmt(po.amount)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(po.issued_date)}</td>
                  {(permissions.can_edit || permissions.can_delete) && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {permissions.can_edit && (
                          <button
                            onClick={() => onEdit(po)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {permissions.can_delete && onDelete && (
                          <button
                            onClick={() => onDelete(po)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.map(po => {
          const isCancelled = po.status === 'cancelled'
          return (
            <button
              key={po.id}
              onClick={() => permissions.can_edit && onEdit(po)}
              className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  {po.po_number && (
                    <p className="text-[11px] font-mono text-gray-400 mb-0.5">{po.po_number}</p>
                  )}
                  <p className={`text-sm font-medium text-navy-800 leading-snug ${isCancelled ? 'line-through' : ''}`}>
                    {po.vendor_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{po.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={po.status} />
                  <span className={`text-sm font-semibold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-navy-900'}`}>
                    {fmt(po.amount)}
                  </span>
                </div>
              </div>
              {po.budget_lines && (
                <p className="text-[11px] text-gray-400 truncate">
                  {po.budget_lines.cost_code} · {po.budget_lines.description}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
