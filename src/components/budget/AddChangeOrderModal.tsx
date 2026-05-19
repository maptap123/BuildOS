'use client'

import { useState } from 'react'
import { X, Link as LinkIcon, Check } from 'lucide-react'
import type { ChangeOrder, ChangeOrderStatus, ChangeOrderType, BudgetLine } from '@/types'

interface Props {
  jobId: string
  order?: ChangeOrder | null
  lines: BudgetLine[]
  canDelete?: boolean
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTS: { value: ChangeOrderStatus; label: string }[] = [
  { value: 'draft',     label: 'Draft'     },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved',  label: 'Approved'  },
  { value: 'rejected',  label: 'Rejected'  },
  { value: 'voided',    label: 'Voided'    },
]

const TYPE_OPTS: { value: ChangeOrderType; label: string; hint: string }[] = [
  { value: 'additive',  label: 'Additive',  hint: 'Increases contract amount'  },
  { value: 'deductive', label: 'Deductive', hint: 'Decreases contract amount'  },
  { value: 'neutral',   label: 'Neutral',   hint: 'Scope change, no cost delta' },
]

export function AddChangeOrderModal({ jobId, order, lines, canDelete, onClose, onSaved }: Props) {
  const isEdit = !!order
  const [title, setTitle]               = useState(order?.title ?? '')
  const [description, setDescription]   = useState(order?.description ?? '')
  const [status, setStatus]             = useState<ChangeOrderStatus>(order?.status ?? 'draft')
  const [type, setType]                 = useState<ChangeOrderType>(order?.type ?? 'additive')
  const [amount, setAmount]             = useState(order ? String(order.amount) : '')
  const [reason, setReason]             = useState(order?.reason ?? '')
  const [submittedDate, setSubmittedDate] = useState(order?.submitted_date ?? '')
  const [approvedDate, setApprovedDate] = useState(order?.approved_date ?? '')
  const [budgetLineId, setBudgetLineId] = useState(order?.budget_line_id ?? '')
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [error, setError]               = useState('')
  const [savedToken, setSavedToken]     = useState<string | null>(
    // Pre-fill if editing a submitted/approved CO that already has a token
    (order && (order.status === 'submitted' || order.status === 'approved') && order.client_token)
      ? order.client_token
      : null
  )
  const [copied, setCopied]             = useState(false)

  function copyClientLink(token: string) {
    const url = `${window.location.origin}/co/${token}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0) {
      setError('Enter a valid amount (0 or greater)')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        job_id: jobId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        type,
        amount: Number(amount),
        reason: reason.trim() || null,
        submitted_date: submittedDate || null,
        approved_date: approvedDate || null,
        budget_line_id: budgetLineId || null,
      }

      const url    = isEdit ? `/api/change-orders/${order!.id}` : '/api/change-orders'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save')
      }
      const saved = await res.json() as ChangeOrder
      // Surface client_token so we can show the copy link button
      if ((saved.status === 'submitted' || saved.status === 'approved') && saved.client_token) {
        setSavedToken(saved.client_token)
      } else {
        setSavedToken(null)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!order || !confirm(`Delete ${order.co_number}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/change-orders/${order.id}`, { method: 'DELETE' })
      onSaved()
    } catch {
      setError('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? `Edit ${order!.co_number}` : 'New Change Order'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    type === opt.value
                      ? 'border-navy-900 bg-navy-50 text-navy-900'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Additional electrical panel upgrade"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ChangeOrderStatus)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
            >
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reason / Scope Description</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this change needed?"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </div>

          {/* Description (internal notes) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Internal Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Internal notes (not visible to client)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Submitted Date</label>
              <input
                type="date"
                value={submittedDate}
                onChange={e => setSubmittedDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Approved Date</label>
              <input
                type="date"
                value={approvedDate}
                onChange={e => setApprovedDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
              />
            </div>
          </div>

          {/* Link to budget line */}
          {lines.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Link to Budget Line (optional)</label>
              <select
                value={budgetLineId}
                onChange={e => setBudgetLineId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
              >
                <option value="">— None —</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{l.cost_code} · {l.description}</option>
                ))}
              </select>
            </div>
          )}

          {/* Client approval link — shown for submitted/approved COs with a token */}
          {savedToken && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Client Approval Link</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-blue-800 bg-white border border-blue-200 rounded px-2 py-1.5 truncate">
                  {typeof window !== 'undefined' ? `${window.location.origin}/co/${savedToken}` : `/co/${savedToken}`}
                </code>
                <button
                  onClick={() => copyClientLink(savedToken)}
                  className={`flex items-center gap-1.5 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {copied ? <Check size={12} /> : <LinkIcon size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
          <div>
            {isEdit && canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete CO'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-navy-900 hover:bg-navy-800 text-white transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create CO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
