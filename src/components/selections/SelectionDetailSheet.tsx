'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { Selection, SelectionsBoard, SelectionStatus } from '@/types'
import { Sheet, fmtMoney, inputClass, labelClass } from './Sheet'

type Perms = { can_create: boolean; can_edit: boolean; can_delete: boolean }
type Overage = { overage: number; draft: { id: string; co_number: string; amount: number } | null } | null

const STATUS_STEPS: { value: SelectionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'selected', label: 'Selected' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'installed', label: 'Installed' },
]

/**
 * One selection: its allowance, its choices, and the pick. Choices are usually entered
 * after the client decides in the showroom, so a new choice is picked in the same step
 * unless one already is. A pick that runs the allowance over says which change order
 * it drafted.
 */
export function SelectionDetailSheet({
  jobId,
  selection,
  board,
  permissions,
  onClose,
  onChanged,
}: {
  jobId: string
  selection: Selection
  board: SelectionsBoard
  permissions: Perms
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const picked = selection.choices.find(c => c.is_selected) ?? null
  const allowance = board.allowances.find(a => a.id === selection.allowance_id) ?? null
  const [adding, setAdding] = useState(selection.choices.length === 0 && permissions.can_create)
  const [form, setForm] = useState({ title: '', client_price: '', vendor_id: '', product_url: '', details: '', builder_cost: '' })
  const [selectNew, setSelectNew] = useState(!picked)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Overage>(null)

  async function call(key: string, url: string, method: string, body?: unknown) {
    setBusy(key); setError('')
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(null); setError(data.error ?? 'Something went wrong'); return null }
    return data
  }

  // The button stays busy until the board has reloaded, so the sheet never shows the
  // pick as saved while its numbers are still the old ones.
  async function settle() {
    await onChanged()
    setBusy(null)
  }

  async function addChoice() {
    if (!form.title.trim()) { setError('Name the choice'); return }
    const price = Number(form.client_price.replace(/[$,]/g, '') || 0)
    if (!Number.isFinite(price)) { setError('Price must be a number'); return }
    const data = await call('add', `/api/selections/${selection.id}/choices`, 'POST', {
      ...form,
      client_price: price,
      builder_cost: form.builder_cost.replace(/[$,]/g, ''),
      select: selectNew,
    })
    if (!data) return
    setNotice(data.overage)
    setForm({ title: '', client_price: '', vendor_id: '', product_url: '', details: '', builder_cost: '' })
    setAdding(false)
    setSelectNew(false)
    await settle()
  }

  async function togglePick(choiceId: string, select: boolean) {
    const data = await call(choiceId, `/api/selections/choices/${choiceId}`, 'PATCH', { is_selected: select })
    if (!data) return
    setNotice(data.overage)
    await settle()
  }

  async function deleteChoice(choiceId: string) {
    if (!confirm('Delete this choice?')) return
    if (await call(`del-${choiceId}`, `/api/selections/choices/${choiceId}`, 'DELETE')) await settle()
  }

  async function patchSelection(body: Record<string, unknown>) {
    if (await call('patch', `/api/selections/${selection.id}`, 'PATCH', body)) await settle()
  }

  async function deleteSelection() {
    if (!confirm(`Delete "${selection.title}" and its choices?`)) return
    if (await call('delete', `/api/selections/${selection.id}`, 'DELETE')) {
      await settle()
      onClose()
    }
  }

  const draftCo = allowance ? board.changeOrders.find(c => c.allowance_id === allowance.id && c.status === 'draft') : null

  return (
    <Sheet
      title={selection.title}
      subtitle={[selection.location, selection.cost_code?.replace(/\.+$/, '')].filter(Boolean).join(' · ') || undefined}
      onClose={onClose}
      footer={permissions.can_delete ? (
        <button
          onClick={deleteSelection}
          disabled={busy === 'delete'}
          className="flex items-center gap-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
        >
          <Trash2 size={15} /> Delete selection
        </button>
      ) : undefined}
    >
      <div className="space-y-5">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {notice?.draft && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-navy-900">
              Over allowance by <b>{fmtMoney(notice.overage)}</b>. Drafted <b>{notice.draft.co_number}</b> for{' '}
              {fmtMoney(notice.draft.amount)}.{' '}
              <Link href={`/jobs/${jobId}/budget?tab=change_orders`} className="font-semibold text-navy-600 underline">
                Review it
              </Link>
            </p>
          </div>
        )}

        {/* Status */}
        <div>
          <p className={labelClass}>Status</p>
          <div className="grid grid-cols-4 gap-1.5">
            {STATUS_STEPS.map(s => {
              const active = selection.status === s.value
              // pending/selected follow the pick; ordered/installed need one.
              const allowed = permissions.can_edit && picked && (s.value === 'ordered' || s.value === 'installed' || s.value === 'selected')
              return (
                <button
                  key={s.value}
                  disabled={!allowed || active || busy === 'patch'}
                  onClick={() => patchSelection({ status: s.value })}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    active ? 'bg-navy-900 border-navy-900 text-white' : 'bg-white border-border text-gray-500'
                  } ${allowed && !active ? 'hover:border-navy-600' : ''}`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Allowance */}
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-600">Allowance</p>
            {permissions.can_edit && (
              <select
                value={selection.allowance_id ?? ''}
                onChange={e => patchSelection({ allowance_id: e.target.value || null })}
                className="text-xs text-navy-600 font-semibold bg-transparent max-w-[60%] truncate"
              >
                <option value="">No allowance</option>
                {board.allowances.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({fmtMoney(a.amount)})</option>
                ))}
              </select>
            )}
          </div>
          {allowance ? (
            <div className="mt-1.5">
              <p className="text-sm text-navy-900 font-medium">{allowance.title}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="Allowance" value={fmtMoney(allowance.amount)} />
                <Stat label="Selected" value={fmtMoney(allowance.spent)} />
                <Stat
                  label={allowance.remaining < 0 ? 'Over' : 'Left'}
                  value={fmtMoney(Math.abs(allowance.remaining))}
                  tone={allowance.remaining < 0 ? 'bad' : 'good'}
                />
              </div>
              {allowance.selection_count > 1 && (
                <p className="text-[11px] text-gray-500 mt-2">Shared by {allowance.selection_count} selections</p>
              )}
              {draftCo && !notice?.draft && (
                <p className="text-[11px] text-amber-700 mt-2">
                  Overage drafted on {draftCo.co_number} ({fmtMoney(draftCo.amount)}) —{' '}
                  <Link href={`/jobs/${jobId}/budget?tab=change_orders`} className="underline font-semibold">review</Link>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-1">No money attached to this selection.</p>
          )}
        </div>

        {/* Choices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Choices ({selection.choices.length})</p>
            {permissions.can_create && !adding && (
              <button onClick={() => { setAdding(true); setSelectNew(!picked) }} className="flex items-center gap-1 text-xs font-semibold text-navy-600">
                <Plus size={14} /> Add choice
              </button>
            )}
          </div>

          <div className="space-y-2">
            {selection.choices.map(c => (
              <div
                key={c.id}
                className={`rounded-xl border p-3 ${c.is_selected ? 'border-green-500 bg-green-50/60' : 'border-border bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-900 break-words">{c.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtMoney(Number(c.client_price))}
                      {c.vendor?.name && <> · {c.vendor.name}</>}
                      {c.builder_cost != null && <> · cost {fmtMoney(Number(c.builder_cost))}</>}
                    </p>
                    {c.details && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{c.details}</p>}
                    {c.product_url && (
                      <a href={c.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 mt-1">
                        Product page <ExternalLink size={11} />
                      </a>
                    )}
                    {c.is_selected && c.selected_at && (
                      <p className="text-[11px] text-green-700 mt-1">
                        Selected {new Date(c.selected_at).toLocaleDateString()}
                        {c.selected_by_user?.full_name && <> by {c.selected_by_user.full_name}</>}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {permissions.can_edit && (
                      <button
                        onClick={() => togglePick(c.id, !c.is_selected)}
                        disabled={busy === c.id}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                          c.is_selected ? 'bg-green-600 text-white' : 'border border-navy-900 text-navy-900'
                        }`}
                      >
                        {c.is_selected ? <><Check size={13} /> Selected</> : 'Select'}
                      </button>
                    )}
                    {permissions.can_delete && (
                      <button onClick={() => deleteChoice(c.id)} aria-label="Delete choice" className="p-1 text-gray-300 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {selection.choices.length === 0 && !adding && (
              <p className="text-sm text-gray-500">No choices yet.</p>
            )}
          </div>

          {adding && (
            <div className="mt-3 rounded-xl border border-navy-100 bg-navy-50/50 p-3 space-y-3">
              <div>
                <label className={labelClass}>Choice</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Delta Trinsic 1-handle, champagne bronze"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Client price</label>
                  <input inputMode="decimal" value={form.client_price} onChange={e => setForm({ ...form, client_price: e.target.value })} placeholder="$0" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Our cost (optional)</label>
                  <input inputMode="decimal" value={form.builder_cost} onChange={e => setForm({ ...form, builder_cost: e.target.value })} placeholder="$0" className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Vendor</label>
                <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} className={inputClass}>
                  <option value="">—</option>
                  {board.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Product link</label>
                <input value={form.product_url} onChange={e => setForm({ ...form, product_url: e.target.value })} placeholder="https://" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Details</label>
                <textarea rows={2} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Model, finish, size" className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-sm text-navy-900">
                <input type="checkbox" checked={selectNew} onChange={e => setSelectNew(e.target.checked)} className="w-4 h-4 accent-navy-900" />
                Client picked this one
              </label>
              <div className="flex justify-end gap-2">
                {selection.choices.length > 0 && (
                  <button onClick={() => setAdding(false)} className="px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
                )}
                <button
                  onClick={addChoice}
                  disabled={busy === 'add'}
                  className="px-4 py-2 rounded-xl bg-navy-900 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {busy === 'add' ? 'Saving…' : 'Save choice'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-surface py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p>
      <p className={`text-sm font-bold ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : 'text-navy-900'}`}>{value}</p>
    </div>
  )
}
