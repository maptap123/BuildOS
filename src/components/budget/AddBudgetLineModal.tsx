'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  jobId: string
  onClose: () => void
  onCreated: () => void
}

export function AddBudgetLineModal({ jobId, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    cost_code: '',
    category: '',
    description: '',
    status: 'draft' as const,
    original_budget: '',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          cost_code: form.cost_code.trim(),
          category: form.category.trim(),
          description: form.description.trim(),
          status: form.status,
          original_budget: parseFloat(form.original_budget) || 0,
          notes: form.notes.trim() || null,
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
          <h2 className="font-display font-semibold text-navy-900 text-base">Add Budget Line</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Cost Code *</label>
              <input
                required
                value={form.cost_code}
                onChange={e => set('cost_code', e.target.value)}
                placeholder="e.g. 03.100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category *</label>
              <input
                required
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="e.g. Concrete"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description *</label>
            <input
              required
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe this budget line"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Budget Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.original_budget}
                  onChange={e => set('original_budget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
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
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="change_order">Change Order</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
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
              {saving ? 'Saving…' : 'Add Line'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
