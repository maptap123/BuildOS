'use client'

import { useState, useMemo } from 'react'
import {
  Plus, AlertCircle, Search, XCircle, Loader2, AlertTriangle, ShieldAlert,
} from 'lucide-react'
import type { Vendor, VendorType } from '@/types'

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insuranceStatus(expiry: string | null): 'ok' | 'soon' | 'expired' | 'none' {
  if (!expiry) return 'none'
  const now = new Date()
  const exp = new Date(expiry)
  const diffDays = Math.floor((exp.getTime() - now.getTime()) / 86400000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= 30) return 'soon'
  return 'ok'
}

function InsuranceBadge({ expiry }: { expiry: string | null }) {
  const status = insuranceStatus(expiry)
  if (status === 'none') return <span className="text-gray-300">—</span>
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-50 text-red-600">
        <ShieldAlert size={10} />
        Expired · {fmt(expiry)}
      </span>
    )
  }
  if (status === 'soon') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-50 text-amber-700">
        <AlertTriangle size={10} />
        Expiring · {fmt(expiry)}
      </span>
    )
  }
  return <span className="text-xs text-gray-500">{fmt(expiry)}</span>
}

const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  subcontractor: 'Subcontractor',
  supplier:      'Supplier',
  equipment:     'Equipment',
  other:         'Other',
}

const TYPE_BADGE: Record<VendorType, string> = {
  subcontractor: 'bg-blue-50 text-blue-700',
  supplier:      'bg-green-50 text-green-700',
  equipment:     'bg-purple-50 text-purple-700',
  other:         'bg-gray-100 text-gray-600',
}

function VendorTypeBadge({ type }: { type: VendorType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[type]}`}>
      {VENDOR_TYPE_LABELS[type]}
    </span>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  vendor?: Vendor | null
  onClose: () => void
  onSaved: () => void
}

function VendorModal({ vendor, onClose, onSaved }: ModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name:             vendor?.name ?? '',
    contact_name:     vendor?.contact_name ?? '',
    email:            vendor?.email ?? '',
    phone:            vendor?.phone ?? '',
    address:          vendor?.address ?? '',
    city:             vendor?.city ?? '',
    state:            vendor?.state ?? '',
    zip:              vendor?.zip ?? '',
    vendor_type:      vendor?.vendor_type ?? 'subcontractor',
    trade:            vendor?.trade ?? '',
    license_number:   vendor?.license_number ?? '',
    insurance_expiry: vendor?.insurance_expiry ?? '',
    notes:            vendor?.notes ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        vendor_type: form.vendor_type,
        trade: form.trade || null,
        license_number: form.license_number || null,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
      }
      const url = vendor ? `/api/vendors/${vendor.id}` : '/api/vendors'
      const method = vendor ? 'PATCH' : 'POST'
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {vendor ? 'Edit Vendor' : 'Add Vendor'}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Ace Framing LLC"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.vendor_type}
                onChange={e => set('vendor_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                {(Object.entries(VENDOR_TYPE_LABELS) as [VendorType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Trade</label>
              <input
                type="text"
                value={form.trade}
                onChange={e => set('trade', e.target.value)}
                placeholder="e.g. Framing, Electrical"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={e => set('contact_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={e => set('city', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={e => set('state', e.target.value)}
                  maxLength={2}
                  placeholder="TX"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ZIP</label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={e => set('zip', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">License #</label>
              <input
                type="text"
                value={form.license_number}
                onChange={e => set('license_number', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Expiry</label>
              <input
                type="date"
                value={form.insurance_expiry}
                onChange={e => set('insurance_expiry', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
              />
            </div>
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
              {vendor ? 'Save Changes' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  initialVendors: Vendor[]
}

const TYPE_FILTER_TABS: { key: VendorType | 'all'; label: string }[] = [
  { key: 'all',          label: 'All'           },
  { key: 'subcontractor',label: 'Subcontractors'},
  { key: 'supplier',     label: 'Suppliers'     },
  { key: 'equipment',    label: 'Equipment'     },
  { key: 'other',        label: 'Other'         },
]

export function VendorsClient({ initialVendors }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors)
  const [typeFilter, setTypeFilter] = useState<VendorType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch('/api/vendors')
    if (res.ok) setVendors(await res.json())
  }

  async function handleDeactivate(v: Vendor) {
    if (!confirm(`Deactivate "${v.name}"? They will no longer appear in dropdowns.`)) return
    setDeactivating(v.id)
    await fetch(`/api/vendors/${v.id}`, { method: 'DELETE' })
    setDeactivating(null)
    await refresh()
  }

  const filtered = useMemo(() => {
    let list = vendors
    if (typeFilter !== 'all') list = list.filter(v => v.vendor_type === typeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.contact_name ?? '').toLowerCase().includes(q) ||
        (v.trade ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [vendors, typeFilter, search])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-navy-900 text-2xl">Vendor Directory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{vendors.length} active vendor{vendors.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={15} />
          Add Vendor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {TYPE_FILTER_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === t.key
                  ? 'bg-navy-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 w-full sm:w-56"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <AlertCircle size={32} className="text-gray-200" />
            {search || typeFilter !== 'all' ? 'No vendors match your filter' : 'No vendors yet'}
            {!search && typeFilter === 'all' && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 text-gold-600 hover:text-gold-700 font-medium transition-colors"
              >
                Add the first vendor →
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-3 py-3 w-32">Type</th>
                    <th className="text-left px-3 py-3">Trade</th>
                    <th className="text-left px-3 py-3">Contact</th>
                    <th className="text-left px-3 py-3">Phone</th>
                    <th className="text-left px-3 py-3">Email</th>
                    <th className="text-left px-3 py-3 w-24">License #</th>
                    <th className="text-left px-3 py-3 w-44">Insurance</th>
                    <th className="text-left px-5 py-3 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-navy-800 max-w-[160px] truncate">{v.name}</td>
                      <td className="px-3 py-3"><VendorTypeBadge type={v.vendor_type} /></td>
                      <td className="px-3 py-3 text-xs text-gray-500">{v.trade ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                        {v.contact_name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {v.phone
                          ? <a href={`tel:${v.phone}`} className="hover:text-navy-800 transition-colors">{v.phone}</a>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                        {v.email
                          ? <a href={`mailto:${v.email}`} className="hover:text-navy-800 transition-colors">{v.email}</a>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 font-mono">
                        {v.license_number ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3"><InsuranceBadge expiry={v.insurance_expiry} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditVendor(v)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeactivate(v)}
                            disabled={deactivating === v.id}
                            className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors disabled:opacity-50"
                          >
                            {deactivating === v.id ? <Loader2 size={12} className="animate-spin" /> : 'Deactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map(v => (
                <button
                  key={v.id}
                  onClick={() => setEditVendor(v)}
                  className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-800 truncate">{v.name}</p>
                      {v.contact_name && <p className="text-xs text-gray-400">{v.contact_name}</p>}
                      {v.trade && <p className="text-xs text-gray-400">{v.trade}</p>}
                    </div>
                    <VendorTypeBadge type={v.vendor_type} />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {v.phone && <p className="text-xs text-gray-500">{v.phone}</p>}
                    <InsuranceBadge expiry={v.insurance_expiry} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <VendorModal
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); await refresh() }}
        />
      )}
      {editVendor && (
        <VendorModal
          vendor={editVendor}
          onClose={() => setEditVendor(null)}
          onSaved={async () => { setEditVendor(null); await refresh() }}
        />
      )}
    </div>
  )
}
