'use client'

import { useState, useEffect } from 'react'
import {
  Plus, AlertCircle, FileEdit, Send, CheckCircle2, Ban, Trash2, Loader2,
  PlayCircle, Clock, XCircle,
} from 'lucide-react'
import type { WorkOrder, WorkOrderStatus, BudgetLine, Vendor } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '—'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WorkOrderStatus,
  { icon: React.ReactNode; bg: string; text: string; label: string }
> = {
  draft:       { icon: <FileEdit size={11} />,      bg: 'bg-gray-100',    text: 'text-gray-600',    label: 'Draft'       },
  sent:        { icon: <Send size={11} />,           bg: 'bg-blue-50',     text: 'text-blue-700',    label: 'Sent'        },
  accepted:    { icon: <CheckCircle2 size={11} />,   bg: 'bg-indigo-50',   text: 'text-indigo-700',  label: 'Accepted'    },
  in_progress: { icon: <PlayCircle size={11} />,     bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'In Progress' },
  completed:   { icon: <CheckCircle2 size={11} />,   bg: 'bg-green-50',    text: 'text-green-700',   label: 'Completed'   },
  cancelled:   { icon: <Ban size={11} />,            bg: 'bg-red-50',      text: 'text-red-600',     label: 'Cancelled'   },
}

function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

interface ModalProps {
  jobId: string
  lines: BudgetLine[]
  wo?: WorkOrder | null
  onClose: () => void
  onSaved: () => void
}

function WorkOrderModal({ jobId, lines, wo, onClose, onSaved }: ModalProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: wo?.title ?? '',
    vendor_id: wo?.vendor_id ?? '',
    budget_line_id: wo?.budget_line_id ?? '',
    scope_of_work: wo?.scope_of_work ?? '',
    amount: wo?.amount?.toString() ?? '0',
    status: wo?.status ?? 'draft',
    issued_date: wo?.issued_date ?? '',
    start_date: wo?.start_date ?? '',
    completion_date: wo?.completion_date ?? '',
    notes: wo?.notes ?? '',
  })

  useEffect(() => {
    fetch('/api/vendors')
      .then(r => { if (r.ok) return r.json(); throw new Error() })
      .then(setVendors)
      .catch(() => setError('Could not load vendor list'))
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        job_id: jobId,
        title: form.title,
        vendor_id: form.vendor_id || null,
        budget_line_id: form.budget_line_id || null,
        scope_of_work: form.scope_of_work || null,
        amount: parseFloat(form.amount) || 0,
        status: form.status,
        issued_date: form.issued_date || null,
        start_date: form.start_date || null,
        completion_date: form.completion_date || null,
        notes: form.notes || null,
      }
      const url = wo ? `/api/work-orders/${wo.id}` : '/api/work-orders'
      const method = wo ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {wo ? 'Edit Work Order' : 'New Work Order'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <XCircle size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Framing Package"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={e => set('vendor_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                <option value="">— None —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.trade ? ` (${v.trade})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Budget Line</label>
              <select
                value={form.budget_line_id}
                onChange={e => set('budget_line_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                <option value="">— None —</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{l.cost_code} · {l.description}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scope of Work</label>
            <textarea
              value={form.scope_of_work}
              onChange={e => set('scope_of_work', e.target.value)}
              rows={3}
              placeholder="Describe the work to be performed…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                {(Object.keys(STATUS_CONFIG) as WorkOrderStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issued Date</label>
              <input
                type="date"
                value={form.issued_date}
                onChange={e => set('issued_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Completion</label>
              <input
                type="date"
                value={form.completion_date}
                onChange={e => set('completion_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {wo ? 'Save Changes' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  workOrders: WorkOrder[]
  lines: BudgetLine[]
  permissions: Permissions
  onRefresh: () => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WorkOrderTable({ jobId, workOrders, lines, permissions, onRefresh }: Props) {
  const [filter, setFilter] = useState<WorkOrderStatus | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editWO, setEditWO] = useState<WorkOrder | null>(null)

  const totalCommitted = workOrders
    .filter(w => w.status !== 'cancelled')
    .reduce((s, w) => s + w.amount, 0)

  const filtered = filter === 'all' ? workOrders : workOrders.filter(w => w.status === filter)

  const filterTabs: { key: WorkOrderStatus | 'all'; label: string }[] = [
    { key: 'all',         label: `All (${workOrders.length})` },
    { key: 'draft',       label: 'Draft'       },
    { key: 'sent',        label: 'Sent'        },
    { key: 'accepted',    label: 'Accepted'    },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed',   label: 'Completed'   },
    { key: 'cancelled',   label: 'Cancelled'   },
  ]

  async function handleDelete(wo: WorkOrder) {
    if (!confirm('Delete this work order? This cannot be undone.')) return
    const res = await fetch(`/api/work-orders/${wo.id}`, { method: 'DELETE' })
    if (res.ok) onRefresh()
  }

  if (workOrders.length === 0 && !showAdd) {
    return (
      <>
        <div className="bg-white rounded-xl border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-display font-semibold text-navy-900 text-base">Work Orders</h2>
            {permissions.can_create && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} />
                New WO
              </button>
            )}
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <Clock size={32} className="text-gray-200" />
            No work orders yet
            {permissions.can_create && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
              >
                Create the first work order →
              </button>
            )}
          </div>
        </div>
        {showAdd && (
          <WorkOrderModal
            jobId={jobId}
            lines={lines}
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); onRefresh() }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display font-semibold text-navy-900 text-base">
              Work Orders
              <span className="ml-2 text-xs font-sans font-normal text-gray-400">{workOrders.length} total</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Committed: <span className="font-semibold text-navy-800">{fmt(totalCommitted)}</span>
            </p>
          </div>
          {permissions.can_create && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              <Plus size={12} />
              New WO
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
                <th className="text-left px-5 py-3 w-24">WO #</th>
                <th className="text-left px-3 py-3">Title</th>
                <th className="text-left px-3 py-3">Vendor</th>
                <th className="text-left px-3 py-3">Budget Line</th>
                <th className="text-right px-3 py-3 w-32">Amount</th>
                <th className="text-left px-3 py-3 w-28">Status</th>
                <th className="text-left px-3 py-3 w-24">Issued</th>
                <th className="text-left px-3 py-3 w-24">Start</th>
                <th className="text-left px-3 py-3 w-24">Done</th>
                {(permissions.can_edit || permissions.can_delete) && (
                  <th className="text-left px-5 py-3 w-20">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(wo => {
                const isCancelled = wo.status === 'cancelled'
                return (
                  <tr
                    key={wo.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-navy-700">{wo.wo_number}</td>
                    <td className="px-3 py-3 font-medium text-navy-800 max-w-[160px] truncate">
                      <span className={isCancelled ? 'line-through text-gray-400' : ''}>{wo.title}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                      {wo.vendors?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                      {wo.budget_lines
                        ? `${wo.budget_lines.cost_code} · ${wo.budget_lines.description}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-navy-900'}`}>
                      {fmt(wo.amount)}
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={wo.status} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(wo.issued_date)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(wo.start_date)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(wo.completion_date)}</td>
                    {(permissions.can_edit || permissions.can_delete) && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {permissions.can_edit && (
                            <button
                              onClick={() => setEditWO(wo)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          {permissions.can_delete && (
                            <button
                              onClick={() => handleDelete(wo)}
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
          {filtered.map(wo => {
            const isCancelled = wo.status === 'cancelled'
            return (
              <button
                key={wo.id}
                onClick={() => permissions.can_edit && setEditWO(wo)}
                className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-gray-400 mb-0.5">{wo.wo_number}</p>
                    <p className={`text-sm font-medium text-navy-800 leading-snug ${isCancelled ? 'line-through' : ''}`}>
                      {wo.title}
                    </p>
                    {wo.vendors && (
                      <p className="text-xs text-gray-400 truncate">{wo.vendors.name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={wo.status} />
                    <span className={`text-sm font-semibold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-navy-900'}`}>
                      {fmt(wo.amount)}
                    </span>
                  </div>
                </div>
                {wo.budget_lines && (
                  <p className="text-[11px] text-gray-400 truncate">
                    {wo.budget_lines.cost_code} · {wo.budget_lines.description}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {showAdd && (
        <WorkOrderModal
          jobId={jobId}
          lines={lines}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onRefresh() }}
        />
      )}
      {editWO && (
        <WorkOrderModal
          jobId={jobId}
          lines={lines}
          wo={editWO}
          onClose={() => setEditWO(null)}
          onSaved={() => { setEditWO(null); onRefresh() }}
        />
      )}
    </>
  )
}
