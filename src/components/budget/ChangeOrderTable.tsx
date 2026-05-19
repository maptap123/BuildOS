'use client'

import { useState } from 'react'
import { Plus, FileEdit, CheckCircle, XCircle, Clock, AlertCircle, Ban, Printer, Link as LinkIcon } from 'lucide-react'
import type { ChangeOrder, ChangeOrderStatus, ChangeOrderType } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const STATUS_CONFIG: Record<ChangeOrderStatus, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
  draft:     { icon: <FileEdit size={12} />,    bg: 'bg-gray-100',   text: 'text-gray-600',  label: 'Draft'     },
  submitted: { icon: <Clock size={12} />,        bg: 'bg-blue-50',    text: 'text-blue-700',  label: 'Submitted' },
  approved:  { icon: <CheckCircle size={12} />,  bg: 'bg-green-50',   text: 'text-green-700', label: 'Approved'  },
  rejected:  { icon: <XCircle size={12} />,      bg: 'bg-red-50',     text: 'text-red-600',   label: 'Rejected'  },
  voided:    { icon: <Ban size={12} />,           bg: 'bg-gray-100',   text: 'text-gray-400',  label: 'Voided'    },
}

const TYPE_LABEL: Record<ChangeOrderType, string> = {
  additive:  '+ Add',
  deductive: '− Deduct',
  neutral:   '± Neutral',
}

const TYPE_AMOUNT_COLOR: Record<ChangeOrderType, string> = {
  additive:  'text-green-600',
  deductive: 'text-red-600',
  neutral:   'text-gray-600',
}

function StatusBadge({ status }: { status: ChangeOrderStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  changeOrders: ChangeOrder[]
  permissions: Permissions
  jobId: string
  onAdd: () => void
  onEdit: (co: ChangeOrder) => void
}

export function ChangeOrderTable({ changeOrders, permissions, jobId, onAdd, onEdit }: Props) {
  const [filter, setFilter] = useState<ChangeOrderStatus | 'all'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function handleCopyLink(co: ChangeOrder, e: React.MouseEvent) {
    e.stopPropagation()
    if (!co.client_token) return
    const url = `${window.location.origin}/co/${co.client_token}`
    copyToClipboard(url)
    setCopiedId(co.co_number)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handlePrint(co: ChangeOrder, e: React.MouseEvent) {
    e.stopPropagation()
    window.open(`/jobs/${jobId}/change-orders/${co.id}/print`, '_blank')
  }

  const totals = {
    approved: changeOrders
      .filter(co => co.status === 'approved')
      .reduce((s, co) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0),
    pending: changeOrders
      .filter(co => co.status === 'submitted')
      .reduce((s, co) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0),
  }

  const filtered = filter === 'all'
    ? changeOrders
    : changeOrders.filter(co => co.status === filter)

  const tabs: { key: ChangeOrderStatus | 'all'; label: string }[] = [
    { key: 'all',       label: `All (${changeOrders.length})` },
    { key: 'draft',     label: 'Draft'     },
    { key: 'submitted', label: 'Submitted' },
    { key: 'approved',  label: 'Approved'  },
    { key: 'rejected',  label: 'Rejected'  },
  ]

  if (changeOrders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Change Orders</h2>
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              New CO
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <AlertCircle size={32} className="text-gray-200" />
          No change orders
          {permissions.can_create && (
            <button onClick={onAdd} className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors">
              Create the first change order →
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
            Change Orders
            <span className="ml-2 text-xs font-sans font-normal text-gray-400">{changeOrders.length} total</span>
          </h2>
          <div className="flex gap-4 mt-1 text-xs">
            <span className="text-gray-500">
              Approved: <span className={totals.approved >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{totals.approved >= 0 ? '+' : ''}{fmt(totals.approved)}</span>
            </span>
            <span className="text-gray-500">
              Pending: <span className="text-blue-600 font-semibold">{totals.pending >= 0 ? '+' : ''}{fmt(totals.pending)}</span>
            </span>
          </div>
        </div>
        {permissions.can_create && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            New CO
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 py-2 border-b border-gray-100 overflow-x-auto">
        {tabs.map(t => (
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
              <th className="text-left px-5 py-3 w-24">CO #</th>
              <th className="text-left px-3 py-3">Title</th>
              <th className="text-left px-3 py-3 w-24">Type</th>
              <th className="text-left px-3 py-3 w-28">Status</th>
              <th className="text-right px-3 py-3 w-32">Amount</th>
              <th className="text-left px-3 py-3 w-28">Submitted</th>
              <th className="text-left px-3 py-3 w-28">Approved</th>
              <th className="text-left px-5 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(co => (
              <tr
                key={co.id}
                onClick={() => permissions.can_edit && onEdit(co)}
                className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${permissions.can_edit ? 'cursor-pointer' : ''}`}
              >
                <td className="px-5 py-3 font-mono text-xs font-semibold text-navy-700">{co.co_number}</td>
                <td className="px-3 py-3">
                  <p className="text-navy-800 font-medium">{co.title}</p>
                  {co.reason && <p className="text-xs text-gray-400 truncate max-w-xs">{co.reason}</p>}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">{TYPE_LABEL[co.type]}</td>
                <td className="px-3 py-3"><StatusBadge status={co.status} /></td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${TYPE_AMOUNT_COLOR[co.type]}`}>
                  {co.type === 'deductive' ? '−' : co.type === 'additive' ? '+' : ''}
                  {fmt(co.amount)}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  {co.submitted_date
                    ? new Date(co.submitted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    : '—'}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  {co.approved_date
                    ? new Date(co.approved_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      title="Print / PDF"
                      onClick={e => handlePrint(co, e)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-navy-700 transition-colors"
                    >
                      <Printer size={13} />
                    </button>
                    {(co.status === 'submitted' || co.status === 'approved') && co.client_token && (
                      <button
                        title={copiedId === co.co_number ? 'Copied!' : 'Copy client approval link'}
                        onClick={e => handleCopyLink(co, e)}
                        className={`p-1.5 rounded transition-colors ${copiedId === co.co_number ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-navy-700 hover:bg-gray-100'}`}
                      >
                        <LinkIcon size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.map(co => (
          <div key={co.id} className="px-4 py-4">
            <button
              onClick={() => permissions.can_edit && onEdit(co)}
              className="w-full text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-gray-400 mb-0.5">{co.co_number}</p>
                  <p className="text-sm font-medium text-navy-800 leading-snug">{co.title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={co.status} />
                  <span className={`text-sm font-semibold tabular-nums ${TYPE_AMOUNT_COLOR[co.type]}`}>
                    {co.type === 'deductive' ? '−' : '+'}{fmt(co.amount)}
                  </span>
                </div>
              </div>
              {co.reason && <p className="text-xs text-gray-400 truncate">{co.reason}</p>}
            </button>
            {/* Mobile action buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={e => handlePrint(co, e)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-navy-700 transition-colors"
              >
                <Printer size={11} /> Print
              </button>
              {(co.status === 'submitted' || co.status === 'approved') && co.client_token && (
                <button
                  onClick={e => handleCopyLink(co, e)}
                  className={`flex items-center gap-1 text-xs transition-colors ${copiedId === co.co_number ? 'text-green-600' : 'text-gray-400 hover:text-navy-700'}`}
                >
                  <LinkIcon size={11} />
                  {copiedId === co.co_number ? 'Copied!' : 'Copy Link'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
