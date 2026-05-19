'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { BudgetLine } from '@/types'

interface Props {
  jobId: string
  budgetLineId: string
  lines: BudgetLine[]
  onClose: () => void
  onCreated: () => void
}

export function AddActualModal({ jobId, budgetLineId, lines, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    budget_line_id: budgetLineId,
    description: '',
    amount: '',
    vendor_name: '',
    invoice_number: '',
    incurred_date: today,
    status: 'pending' as const,
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          budget_line_id: form.budget_line_id || null,
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          vendor_name: form.vendor_name.trim() || null,
          invoice_number: form.invoice_number.trim() || null,
          incurred_date: form.incurred_date,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Add Actual Cost</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Budget Line</label>
            <select
              value={form.budget_line_id}
              onChange={e => set('budget_line_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
            >
              <option value="">— Unassigned —</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>
                  {l.cost_code} · {l.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description *</label>
            <input
              required
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="e.g. Concrete pour — foundation"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Date *</label>
              <input
                required
                type="date"
                value={form.incurred_date}
                onChange={e => set('incurred_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Vendor</label>
              <input
                value={form.vendor_name}
                onChange={e => set('vendor_name', e.target.value)}
                placeholder="Vendor name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Invoice #</label>
              <input
                value={form.invoice_number}
                onChange={e => set('invoice_number', e.target.value)}
                placeholder="INV-0001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Add Actual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
