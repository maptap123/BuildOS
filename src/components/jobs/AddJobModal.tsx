'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Job, JobStatus } from '@/types'
import { useTagOptions } from '@/hooks/useTagOptions'
import { useUsers } from '@/hooks/useUsers'

interface Props {
  onClose: () => void
  onCreated: (job: Job) => void
}

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'lead',    label: 'Lead'    },
  { value: 'presale', label: 'Presale' },
  { value: 'active',  label: 'Active'  },
  { value: 'closed',  label: 'Closed'  },
]

function moneyOrNull(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function AddJobModal({ onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    site_address: '',
    city: '',
    state: '',
    postal_code: '',
    status: 'lead' as JobStatus,
    start_date: '',
    target_completion_date: '',
    contract_amount: '',
    estimated_cost: '',
    description: '',
  })
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [managerId, setManagerId] = useState<string>('')

  const { tags: tagOptions } = useTagOptions()
  const { users } = useUsers()

  function set(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function toggleTag(name: string) {
    setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          client_name: form.client_name.trim(),
          client_email: emptyOrNull(form.client_email),
          client_phone: emptyOrNull(form.client_phone),
          site_address: form.site_address.trim(),
          city: emptyOrNull(form.city),
          state: emptyOrNull(form.state),
          postal_code: emptyOrNull(form.postal_code),
          status: form.status,
          start_date: form.start_date || null,
          target_completion_date: form.target_completion_date || null,
          contract_amount: moneyOrNull(form.contract_amount),
          estimated_cost: moneyOrNull(form.estimated_cost),
          description: emptyOrNull(form.description),
          tags: selectedTags,
          project_manager_id: managerId || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      onCreated(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-3xl md:rounded-xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-display font-semibold text-navy-900 text-base">New Job</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manual project creation for quick setup.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {/* Job Name + Client */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Job Name *</label>
              <input
                required
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Project name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Client *</label>
              <input
                required
                value={form.client_name}
                onChange={e => set('client_name', e.target.value)}
                placeholder="Client name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Client Email</label>
              <input
                type="email"
                value={form.client_email}
                onChange={e => set('client_email', e.target.value)}
                placeholder="client@email.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Client Phone</label>
              <input
                value={form.client_phone}
                onChange={e => set('client_phone', e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Site Address *</label>
            <input
              required
              value={form.site_address}
              onChange={e => set('site_address', e.target.value)}
              placeholder="Street address"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">City</label>
              <input
                value={form.city}
                onChange={e => set('city', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">State</label>
              <input
                value={form.state}
                onChange={e => set('state', e.target.value)}
                maxLength={2}
                placeholder="TN"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">ZIP</label>
              <input
                value={form.postal_code}
                onChange={e => set('postal_code', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
              >
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Target Completion</label>
              <input
                type="date"
                value={form.target_completion_date}
                onChange={e => set('target_completion_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Contract Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.contract_amount}
                  onChange={e => set('contract_amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Estimated Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_cost}
                  onChange={e => set('estimated_cost', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Optional scope notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {/* Manager */}
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Manager</label>
              <select
                value={managerId}
                onChange={e => setManagerId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
              >
                <option value="">— Unassigned —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ?? u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          {tagOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Tags</label>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map(opt => {
                  const active = selectedTags.includes(opt.name)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleTag(opt.name)}
                      className={`inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-navy-700 text-white border-navy-700'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-navy-400 hover:text-navy-700'
                      }`}
                    >
                      {opt.name}
                      {active && <X size={11} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
