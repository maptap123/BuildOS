'use client'

import { useState } from 'react'
import {
  Plus, AlertCircle, Trash2, CheckCircle2, Clock, FileText, DollarSign,
} from 'lucide-react'
import type { BillingMilestone, BillingMilestoneStatus } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '—'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BillingMilestoneStatus,
  { icon: React.ReactNode; bg: string; text: string; label: string }
> = {
  pending:  { icon: <Clock size={11} />,        bg: 'bg-amber-50',  text: 'text-amber-700', label: 'Pending'  },
  invoiced: { icon: <FileText size={11} />,     bg: 'bg-blue-50',   text: 'text-blue-700',  label: 'Invoiced' },
  paid:     { icon: <CheckCircle2 size={11} />, bg: 'bg-green-50',  text: 'text-green-700', label: 'Paid'     },
}

function StatusBadge({ status }: { status: BillingMilestoneStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── Empty form state ─────────────────────────────────────────────────────────

interface FormState {
  title: string
  description: string
  amount: string
  due_date: string
  invoice_number: string
  notes: string
  status: BillingMilestoneStatus
}

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  amount: '',
  due_date: '',
  invoice_number: '',
  notes: '',
  status: 'pending',
})

// ─── Props ────────────────────────────────────────────────────────────────────

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  milestones: BillingMilestone[]
  permissions: Permissions
  onRefresh: () => void
}

// ─── Add / Edit form ─────────────────────────────────────────────────────────

function MilestoneForm({
  jobId,
  initial,
  sortOrder,
  onSaved,
  onCancel,
}: {
  jobId: string
  initial?: BillingMilestone
  sortOrder: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          title: initial.title,
          description: initial.description ?? '',
          amount: String(initial.amount),
          due_date: initial.due_date ?? '',
          invoice_number: initial.invoice_number ?? '',
          notes: initial.notes ?? '',
          status: initial.status,
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Title is required'); return }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount < 0) { setErr('Enter a valid amount'); return }

    setSaving(true)
    setErr(null)
    try {
      const url = initial ? `/api/billing-milestones/${initial.id}` : '/api/billing-milestones'
      const method = initial ? 'PATCH' : 'POST'
      const body = initial
        ? { title: form.title, description: form.description || null, amount, status: form.status, due_date: form.due_date || null, invoice_number: form.invoice_number || null, notes: form.notes || null }
        : { job_id: jobId, title: form.title, description: form.description || null, amount, status: form.status, due_date: form.due_date || null, invoice_number: form.invoice_number || null, notes: form.notes || null, sort_order: sortOrder }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to save milestone')
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      {err && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0" />
          {err}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
          <input
            value={form.title}
            onChange={set('title')}
            placeholder="e.g. Foundation Complete"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input
            value={form.description}
            onChange={set('description')}
            placeholder="Optional details"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount <span className="text-red-500">*</span></label>
          <div className="relative">
            <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            value={form.status}
            onChange={set('status')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 bg-white"
          >
            <option value="pending">Pending</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={set('due_date')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Invoice #</label>
          <input
            value={form.invoice_number}
            onChange={set('invoice_number')}
            placeholder="INV-001"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Internal notes"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 resize-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Milestone'}
        </button>
      </div>
    </form>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BillingMilestonesTable({ jobId, milestones, permissions, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editMilestone, setEditMilestone] = useState<BillingMilestone | null>(null)

  async function markStatus(milestone: BillingMilestone, status: BillingMilestoneStatus) {
    const patch: Record<string, unknown> = { status }
    if (status === 'invoiced' && !milestone.invoiced_date) {
      patch.invoiced_date = new Date().toISOString().slice(0, 10)
    }
    if (status === 'paid' && !milestone.paid_date) {
      patch.paid_date = new Date().toISOString().slice(0, 10)
    }
    const res = await fetch(`/api/billing-milestones/${milestone.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) onRefresh()
  }

  async function handleDelete(milestone: BillingMilestone) {
    if (!confirm('Delete this milestone? This cannot be undone.')) return
    const res = await fetch(`/api/billing-milestones/${milestone.id}`, { method: 'DELETE' })
    if (res.ok) onRefresh()
  }

  const totalBilled = milestones
    .filter(m => m.status === 'invoiced' || m.status === 'paid')
    .reduce((s, m) => s + m.amount, 0)
  const totalPaid = milestones
    .filter(m => m.status === 'paid')
    .reduce((s, m) => s + m.amount, 0)
  const totalContract = milestones.reduce((s, m) => s + m.amount, 0)

  if (milestones.length === 0 && !showForm) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Draw Schedule</h2>
          {permissions.can_create && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add Milestone
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <AlertCircle size={32} className="text-gray-200" />
          No billing milestones yet
          {permissions.can_create && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Create the first milestone →
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
            Draw Schedule
            <span className="ml-2 text-xs font-sans font-normal text-gray-400">{milestones.length} milestone{milestones.length !== 1 ? 's' : ''}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Scheduled: <span className="font-semibold text-navy-800">{fmt(totalContract)}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            Invoiced: <span className="font-semibold text-blue-700">{fmt(totalBilled)}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            Collected: <span className="font-semibold text-green-700">{fmt(totalPaid)}</span>
          </p>
        </div>
        {permissions.can_create && !showForm && !editMilestone && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            Add Milestone
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="px-5 py-4 border-b border-gray-100">
          <MilestoneForm
            jobId={jobId}
            sortOrder={milestones.length}
            onSaved={() => { setShowForm(false); onRefresh() }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Desktop table */}
      {milestones.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                <th className="text-left px-5 py-3 w-8">#</th>
                <th className="text-left px-3 py-3">Title</th>
                <th className="text-left px-3 py-3">Description</th>
                <th className="text-right px-3 py-3 w-32">Amount</th>
                <th className="text-left px-3 py-3 w-28">Due</th>
                <th className="text-left px-3 py-3 w-28">Status</th>
                <th className="text-left px-3 py-3 w-28">Invoiced</th>
                <th className="text-left px-3 py-3 w-28">Paid</th>
                {(permissions.can_edit || permissions.can_delete) && (
                  <th className="text-left px-5 py-3 w-32">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, idx) => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {editMilestone?.id === m.id ? (
                    <td colSpan={9} className="px-5 py-4">
                      <MilestoneForm
                        jobId={jobId}
                        initial={m}
                        sortOrder={m.sort_order}
                        onSaved={() => { setEditMilestone(null); onRefresh() }}
                        onCancel={() => setEditMilestone(null)}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-5 py-3 text-xs text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-navy-800 max-w-[160px] truncate">{m.title}</td>
                      <td className="px-3 py-3 text-gray-500 max-w-[200px] truncate">
                        {m.description ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-navy-900">{fmt(m.amount)}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(m.due_date)}</td>
                      <td className="px-3 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(m.invoiced_date)}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(m.paid_date)}</td>
                      {(permissions.can_edit || permissions.can_delete) && (
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {permissions.can_edit && m.status === 'pending' && (
                              <button
                                onClick={() => markStatus(m, 'invoiced')}
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors whitespace-nowrap"
                              >
                                Mark Invoiced
                              </button>
                            )}
                            {permissions.can_edit && m.status === 'invoiced' && (
                              <button
                                onClick={() => markStatus(m, 'paid')}
                                className="text-[11px] text-green-600 hover:text-green-800 font-medium transition-colors whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            )}
                            {permissions.can_edit && (
                              <button
                                onClick={() => { setShowForm(false); setEditMilestone(m) }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                              >
                                Edit
                              </button>
                            )}
                            {permissions.can_delete && (
                              <button
                                onClick={() => handleDelete(m)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs font-semibold">
                <td className="px-5 py-3 text-gray-500" colSpan={3}>Totals</td>
                <td className="px-3 py-3 text-right tabular-nums text-navy-900">{fmt(totalContract)}</td>
                <td colSpan={2} />
                <td className="px-3 py-3 tabular-nums text-blue-700">{fmt(totalBilled)}</td>
                <td className="px-3 py-3 tabular-nums text-green-700">{fmt(totalPaid)}</td>
                {(permissions.can_edit || permissions.can_delete) && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {milestones.length > 0 && (
        <div className="md:hidden divide-y divide-gray-100">
          {milestones.map(m => (
            <div key={m.id} className="px-4 py-4">
              {editMilestone?.id === m.id ? (
                <MilestoneForm
                  jobId={jobId}
                  initial={m}
                  sortOrder={m.sort_order}
                  onSaved={() => { setEditMilestone(null); onRefresh() }}
                  onCancel={() => setEditMilestone(null)}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-800 leading-snug">{m.title}</p>
                      {m.description && (
                        <p className="text-xs text-gray-400 truncate">{m.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={m.status} />
                      <span className="text-sm font-semibold tabular-nums text-navy-900">{fmt(m.amount)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                    {m.due_date && <span>Due {fmtDate(m.due_date)}</span>}
                    {m.invoiced_date && <span>Inv {fmtDate(m.invoiced_date)}</span>}
                    {m.paid_date && <span>Paid {fmtDate(m.paid_date)}</span>}
                  </div>
                  {(permissions.can_edit || permissions.can_delete) && (
                    <div className="flex items-center gap-3 mt-2">
                      {permissions.can_edit && m.status === 'pending' && (
                        <button
                          onClick={() => markStatus(m, 'invoiced')}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Mark Invoiced
                        </button>
                      )}
                      {permissions.can_edit && m.status === 'invoiced' && (
                        <button
                          onClick={() => markStatus(m, 'paid')}
                          className="text-[11px] text-green-600 hover:text-green-800 font-medium"
                        >
                          Mark Paid
                        </button>
                      )}
                      {permissions.can_edit && (
                        <button
                          onClick={() => { setShowForm(false); setEditMilestone(m) }}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                      )}
                      {permissions.can_delete && (
                        <button
                          onClick={() => handleDelete(m)}
                          className="text-gray-300 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
