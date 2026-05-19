'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Lead, LeadSource, LeadStatus } from '@/types'

interface Props {
  lead?: Lead | null
  onClose: () => void
  onSaved: (lead: Lead) => void
}

type FormState = {
  title: string
  client_name: string
  client_email: string
  client_phone: string
  address: string
  source: string
  estimated_value: string
  status: LeadStatus
  notes: string
}

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'referral',  label: 'Referral'      },
  { value: 'website',   label: 'Website'        },
  { value: 'cold_call', label: 'Cold Call'      },
  { value: 'repeat',    label: 'Repeat Client'  },
  { value: 'other',     label: 'Other'          },
]

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new',       label: 'New'       },
  { value: 'contacted', label: 'Contacted' },
  { value: 'proposal',  label: 'Proposal'  },
  { value: 'won',       label: 'Won'       },
  { value: 'lost',      label: 'Lost'      },
]

export function AddLeadModal({ lead, onClose, onSaved }: Props) {
  const isEdit = Boolean(lead)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    title:           lead?.title           ?? '',
    client_name:     lead?.client_name     ?? '',
    client_email:    lead?.client_email    ?? '',
    client_phone:    lead?.client_phone    ?? '',
    address:         lead?.address         ?? '',
    source:          lead?.source          ?? '',
    estimated_value: lead?.estimated_value != null ? String(lead.estimated_value) : '',
    status:          lead?.status          ?? 'new',
    notes:           lead?.notes           ?? '',
  })

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const payload = {
        ...(isEdit ? { id: lead!.id } : {}),
        title:           form.title.trim(),
        client_name:     form.client_name.trim()  || null,
        client_email:    form.client_email.trim() || null,
        client_phone:    form.client_phone.trim() || null,
        address:         form.address.trim()       || null,
        source:          form.source               || null,
        estimated_value: form.estimated_value !== '' ? Number(form.estimated_value) : null,
        status:          form.status,
        notes:           form.notes.trim()         || null,
      }

      const res = await fetch('/api/leads', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      const saved: Lead = await res.json()
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Lead' : 'Add Lead'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Title */}
          <div>
            <label className={labelCls}>Project Title *</label>
            <input
              type="text"
              required
              autoFocus={!isEdit}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Smith Residence Kitchen Remodel"
              className={inputCls}
            />
          </div>

          {/* Client name */}
          <div>
            <label className={labelCls}>Client Name</label>
            <input
              type="text"
              value={form.client_name}
              onChange={e => set('client_name', e.target.value)}
              placeholder="Full name"
              className={inputCls}
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={form.client_email}
                onChange={e => set('client_email', e.target.value)}
                placeholder="email@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                value={form.client_phone}
                onChange={e => set('client_phone', e.target.value)}
                placeholder="(555) 000-0000"
                className={inputCls}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>Project Address</label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="123 Main St, City, State"
              className={inputCls}
            />
          </div>

          {/* Source + Estimated Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Lead Source</label>
              <select
                value={form.source}
                onChange={e => set('source', e.target.value)}
                className={inputCls}
              >
                <option value="">Select source…</option>
                {SOURCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Est. Value ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_value}
                onChange={e => set('estimated_value', e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
          </div>

          {/* Status (edit mode only) */}
          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as LeadStatus)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Any relevant details about this lead…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-2">
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
