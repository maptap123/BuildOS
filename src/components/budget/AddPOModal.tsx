'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { PurchaseOrder, POStatus, BudgetLine } from '@/types'

interface Props {
  jobId: string
  po?: PurchaseOrder | null
  lines: BudgetLine[]
  canDelete?: boolean
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTS: { value: POStatus; label: string }[] = [
  { value: 'draft',     label: 'Draft'     },
  { value: 'sent',      label: 'Sent'      },
  { value: 'received',  label: 'Received'  },
  { value: 'closed',    label: 'Closed'    },
  { value: 'cancelled', label: 'Cancelled' },
]

const INPUT_CLASS =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white'

export function AddPOModal({ jobId, po, lines, canDelete, onClose, onSaved }: Props) {
  const isEdit = !!po

  const [vendorName, setVendorName]     = useState(po?.vendor_name ?? '')
  const [poNumber, setPoNumber]         = useState(po?.po_number ?? '')
  const [description, setDescription]  = useState(po?.description ?? '')
  const [amount, setAmount]             = useState(po ? String(po.amount) : '')
  const [budgetLineId, setBudgetLineId] = useState(po?.budget_line_id ?? '')
  const [status, setStatus]             = useState<POStatus>(po?.status ?? 'draft')
  const [issuedDate, setIssuedDate]     = useState(po?.issued_date ?? '')
  const [expectedDate, setExpectedDate] = useState(po?.expected_date ?? '')
  const [notes, setNotes]               = useState(po?.notes ?? '')
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [error, setError]               = useState('')

  async function handleSave() {
    if (!vendorName.trim()) { setError('Vendor name is required'); return }
    if (!description.trim()) { setError('Description is required'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0) {
      setError('Enter a valid amount (0 or greater)')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        job_id: jobId,
        vendor_name: vendorName.trim(),
        po_number: poNumber.trim() || null,
        description: description.trim(),
        amount: Number(amount),
        budget_line_id: budgetLineId || null,
        status,
        issued_date: issuedDate || null,
        expected_date: expectedDate || null,
        notes: notes.trim() || null,
      }

      let res: Response
      if (isEdit) {
        res = await fetch('/api/purchase-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: po!.id, ...payload }),
        })
      } else {
        res = await fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to save')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!po || !confirm(`Delete this purchase order? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/purchase-orders?id=${po.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to delete')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Purchase Order' : 'New Purchase Order'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Vendor name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Vendor Name *
            </label>
            <input
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              placeholder="e.g. ABC Concrete Supply"
              className={INPUT_CLASS}
            />
          </div>

          {/* PO number */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              PO Number <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <input
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              placeholder="e.g. PO-2024-001"
              className={INPUT_CLASS}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Description *
            </label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is being purchased?"
              className={INPUT_CLASS}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          {/* Budget line selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Link to Budget Line <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <select
              value={budgetLineId}
              onChange={e => setBudgetLineId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— None —</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>
                  {l.cost_code} · {l.description}
                </option>
              ))}
            </select>
          </div>

          {/* Status — edit mode only */}
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as POStatus)}
                className={INPUT_CLASS}
              >
                {STATUS_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Issued Date
              </label>
              <input
                type="date"
                value={issuedDate}
                onChange={e => setIssuedDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Expected Date
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
          <div>
            {isEdit && canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete PO'}
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create PO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
