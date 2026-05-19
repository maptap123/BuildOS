'use client'

import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import type { Contact, Job } from '@/types'

interface Props {
  contact?: Contact | null
  onClose: () => void
  onSaved: (contact: Contact) => void
}

type FormState = {
  full_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  postal_code: string
  job_id: string
  is_primary: boolean
  notes: string
}

function emptyForm(contact?: Contact | null): FormState {
  return {
    full_name:   contact?.full_name ?? '',
    email:       contact?.email ?? '',
    phone:       contact?.phone ?? '',
    address:     contact?.address ?? '',
    city:        contact?.city ?? '',
    state:       contact?.state ?? '',
    postal_code: contact?.postal_code ?? '',
    job_id:      contact?.job_id ?? '',
    is_primary:  contact?.is_primary ?? false,
    notes:       contact?.notes ?? '',
  }
}

export function AddContactModal({ contact, onClose, onSaved }: Props) {
  const isEdit = Boolean(contact)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addressOpen, setAddressOpen] = useState(Boolean(contact?.address || contact?.city || contact?.state || contact?.postal_code))
  const [jobs, setJobs] = useState<Pick<Job, 'id' | 'name'>[]>([])
  const [form, setForm] = useState<FormState>(() => emptyForm(contact))

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.ok ? r.json() : [])
      .then((data: Job[]) => setJobs(data.map(j => ({ id: j.id, name: j.name }))))
      .catch(() => {})
  }, [])

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setError('Full name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...(isEdit ? { id: contact!.id } : {}),
        full_name:   form.full_name.trim(),
        email:       form.email.trim() || null,
        phone:       form.phone.trim() || null,
        address:     form.address.trim() || null,
        city:        form.city.trim() || null,
        state:       form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        job_id:      form.job_id || null,
        is_primary:  form.is_primary,
        notes:       form.notes.trim() || null,
      }
      const res = await fetch('/api/contacts', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const saved: Contact = await res.json()
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name *</label>
            <input
              type="text"
              required
              autoFocus={!isEdit}
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Jane Smith"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="jane@example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="(555) 000-0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Linked Job</label>
            <select
              value={form.job_id}
              onChange={e => set('job_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
            >
              <option value="">No job linked</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set('is_primary', !form.is_primary)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                form.is_primary ? 'bg-gold-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  form.is_primary ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Primary contact</span>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAddressOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 px-3 py-2 rounded-lg transition-colors"
            >
              {addressOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {addressOpen ? 'Hide address' : 'Add address'}
            </button>

            {addressOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Street Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                    placeholder="123 Main St"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => set('city', e.target.value)}
                      placeholder="Springfield"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">State</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={e => set('state', e.target.value)}
                      placeholder="IL"
                      maxLength={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Zip</label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={e => set('postal_code', e.target.value)}
                      placeholder="62701"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Any additional notes about this contact…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
