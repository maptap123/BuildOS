'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Link2 } from 'lucide-react'
import type { ScheduleItem, ScheduleItemStatus, ScheduleItemType, PredecessorType } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TRADES = [
  'General', 'Site Work', 'Concrete', 'Masonry', 'Framing', 'Roofing',
  'Exterior', 'Insulation', 'Drywall', 'Flooring', 'Millwork/Trim',
  'Painting', 'Plumbing', 'Mechanical/HVAC', 'Electrical', 'Fire Suppression',
  'Landscaping', 'Punch List', 'Inspections', 'Closeout',
]

const SCHEDULE_COLORS = [
  { name: 'Blue',    hex: '#3B82F6' },
  { name: 'Indigo',  hex: '#6366F1' },
  { name: 'Violet',  hex: '#8B5CF6' },
  { name: 'Purple',  hex: '#A855F7' },
  { name: 'Pink',    hex: '#EC4899' },
  { name: 'Rose',    hex: '#F43F5E' },
  { name: 'Red',     hex: '#EF4444' },
  { name: 'Orange',  hex: '#F97316' },
  { name: 'Amber',   hex: '#F59E0B' },
  { name: 'Yellow',  hex: '#EAB308' },
  { name: 'Lime',    hex: '#84CC16' },
  { name: 'Green',   hex: '#22C55E' },
  { name: 'Teal',    hex: '#14B8A6' },
  { name: 'Sky',     hex: '#0EA5E9' },
  { name: 'Slate',   hex: '#64748B' },
  { name: 'Navy',    hex: '#1b2b4a' },
]

const DEFAULT_COLOR = '#3B82F6'

const PRED_TYPES: { value: PredecessorType; label: string }[] = [
  { value: 'FS', label: 'Finish-to-Start (FS)' },
  { value: 'SS', label: 'Start-to-Start (SS)'  },
  { value: 'FF', label: 'Finish-to-Finish (FF)' },
  { value: 'SF', label: 'Start-to-Finish (SF)'  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface PredRow {
  predecessor_id: string
  type: PredecessorType
  lag_days: number
}

type ModalTab = 'details' | 'predecessors'

interface Props {
  jobId: string
  item?: ScheduleItem
  allItems?: ScheduleItem[]   // all schedule items in this job (for predecessor dropdown)
  canDelete?: boolean
  onClose: () => void
  onSaved: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddScheduleItemModal({
  jobId,
  item,
  allItems = [],
  canDelete,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!item
  const [tab, setTab] = useState<ModalTab>('details')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const todayISO = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    title:            item?.title ?? '',
    description:      item?.description ?? '',
    status:           (item?.status ?? 'not_started') as ScheduleItemStatus,
    type:             (item?.type ?? 'phase') as ScheduleItemType,
    start_date:       item?.start_date ?? todayISO,
    end_date:         item?.end_date ?? todayISO,
    sort_order:       String(item?.sort_order ?? 0),
    percent_complete: String(item?.percent_complete ?? 0),
    trade:            item?.trade ?? '',
    color:            item?.color ?? DEFAULT_COLOR,
  })

  const [preds, setPreds]           = useState<PredRow[]>([])
  const [predsLoading, setPredsLoading] = useState(false)

  // Load existing predecessors on edit open
  useEffect(() => {
    if (!item?.id) return
    setPredsLoading(true)
    fetch(`/api/schedule/${item.id}/predecessors`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { predecessor_id: string; type: PredecessorType; lag_days: number }[]) =>
        setPreds(data.map(p => ({
          predecessor_id: p.predecessor_id,
          type: p.type,
          lag_days: p.lag_days,
        })))
      )
      .catch(() => {})
      .finally(() => setPredsLoading(false))
  }, [item?.id])

  function setField(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setPercent(val: string) {
    const pct = parseInt(val) || 0
    let newStatus = form.status as ScheduleItemStatus
    if (pct === 100) newStatus = 'completed'
    else if (pct > 0 && form.status === 'not_started') newStatus = 'in_progress'
    else if (pct === 0 && form.status === 'in_progress') newStatus = 'not_started'
    setForm(f => ({ ...f, percent_complete: val, status: newStatus }))
  }

  function addPredRow() {
    setPreds(ps => [...ps, { predecessor_id: '', type: 'FS', lag_days: 0 }])
  }

  function removePredRow(idx: number) {
    setPreds(ps => ps.filter((_, i) => i !== idx))
  }

  function updatePredRow(idx: number, updates: Partial<PredRow>) {
    setPreds(ps => ps.map((p, i) => i === idx ? { ...p, ...updates } : p))
  }

  // Items eligible to be a predecessor (not the current item, not creating circular refs)
  const eligibleItems = allItems.filter(i => i.id !== item?.id)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const isMilestone = form.type === 'milestone'
      const payload = {
        job_id: jobId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        type: form.type,
        start_date: form.start_date,
        end_date: isMilestone ? form.start_date : form.end_date,
        all_day: true,
        sort_order: parseInt(form.sort_order) || 0,
        percent_complete: parseInt(form.percent_complete) || 0,
        trade: form.trade || null,
        color: form.color || null,
      }

      const res = isEdit
        ? await fetch(`/api/schedule/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      const savedItem = await res.json()
      const itemId = isEdit ? item.id : savedItem.id

      // Replace all predecessors atomically
      const validPreds = preds.filter(p => p.predecessor_id)
      await fetch(`/api/schedule/${itemId}/predecessors`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPreds),
      })

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  async function deleteItem() {
    if (!item) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setDeleting(false)
    }
  }

  const pct = parseInt(form.percent_complete) || 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit
              ? (form.type === 'milestone' ? 'Edit Milestone' : 'Edit Phase')
              : (form.type === 'milestone' ? 'Add Milestone' : 'Add Phase')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-100 shrink-0 px-6">
          {([
            { id: 'details',      label: 'Details'      },
            { id: 'predecessors', label: 'Predecessors', badge: preds.filter(p => p.predecessor_id).length || null },
          ] as { id: ModalTab; label: string; badge?: number | null }[]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-navy-900 text-navy-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.id === 'predecessors' && <Link2 size={13} />}
              {t.label}
              {t.badge ? (
                <span className="bg-navy-100 text-navy-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto">

          {/* ── DETAILS TAB ── */}
          {tab === 'details' && (
            <div className="px-6 py-5 space-y-4">

              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Item Type</label>
                <div className="flex gap-2">
                  {([
                    { value: 'phase',     label: 'Phase / Task' },
                    { value: 'milestone', label: 'Milestone ◆' },
                  ] as { value: ScheduleItemType; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField('type', opt.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                        form.type === opt.value
                          ? 'bg-navy-900 text-white border-navy-900'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title + color dot */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Phase / Task Name *</label>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
                  <input
                    required
                    value={form.title}
                    onChange={e => setField('title', e.target.value)}
                    placeholder="e.g. Foundation, Framing, Rough-In…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Display Color</label>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_COLORS.map(({ name, hex }) => (
                    <button
                      key={hex}
                      type="button"
                      title={name}
                      onClick={() => setField('color', hex)}
                      className={`w-7 h-7 rounded-full transition-all hover:scale-110 focus:outline-none ${
                        form.color === hex ? 'ring-2 ring-offset-2 ring-navy-800 scale-110' : 'ring-1 ring-black/10'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Dates */}
              {form.type === 'milestone' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Date *</label>
                  <input
                    required
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date *</label>
                    <input
                      required
                      type="date"
                      value={form.start_date}
                      onChange={e => {
                        const d = e.target.value
                        setForm(f => ({
                          ...f,
                          start_date: d,
                          end_date: (!f.end_date || f.end_date < d) ? d : f.end_date,
                        }))
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date *</label>
                    <input
                      required
                      type="date"
                      value={form.end_date}
                      min={form.start_date || undefined}
                      onChange={e => setField('end_date', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                </div>
              )}

              {/* Trade + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Trade</label>
                  <select
                    value={form.trade}
                    onChange={e => setField('trade', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                  >
                    <option value="">— Any —</option>
                    {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setField('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">% Complete</label>
                  <span className={`text-sm font-bold ${pct === 100 ? 'text-green-600' : pct > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                    {pct}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={form.percent_complete}
                  onChange={e => setPercent(e.target.value)}
                  className="w-full accent-gold-500"
                />
                <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  rows={2}
                  placeholder="Optional notes…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
                />
              </div>
            </div>
          )}

          {/* ── PREDECESSORS TAB ── */}
          {tab === 'predecessors' && (
            <div className="px-6 py-5">

              {predsLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : (
                <>
                  {/* Column headers */}
                  {preds.length > 0 && (
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 mb-2 px-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Type</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Lag</span>
                      <span />
                    </div>
                  )}

                  {/* Predecessor rows */}
                  <div className="space-y-2">
                    {preds.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">

                        {/* Name dropdown */}
                        <select
                          value={row.predecessor_id}
                          onChange={e => updatePredRow(idx, { predecessor_id: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                        >
                          <option value="">— Select phase —</option>
                          {eligibleItems.map(si => (
                            <option key={si.id} value={si.id}>{si.title}</option>
                          ))}
                        </select>

                        {/* Type dropdown */}
                        <select
                          value={row.type}
                          onChange={e => updatePredRow(idx, { type: e.target.value as PredecessorType })}
                          className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                        >
                          {PRED_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>

                        {/* Lag */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={row.lag_days}
                            onChange={e => updatePredRow(idx, { lag_days: parseInt(e.target.value) || 0 })}
                            className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm text-navy-900 text-center focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                          />
                          <span className="text-xs text-gray-400 whitespace-nowrap">days</span>
                        </div>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => removePredRow(idx)}
                          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Empty state */}
                  {preds.length === 0 && (
                    <div className="text-center py-8">
                      <Link2 size={28} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No predecessors yet</p>
                      <p className="text-xs text-gray-300 mt-0.5">
                        Link phases to define the order they must be completed
                      </p>
                    </div>
                  )}

                  {/* No eligible items to choose from */}
                  {eligibleItems.length === 0 && preds.length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Add more phases to this schedule to use predecessors
                    </p>
                  )}

                  {/* Add predecessor */}
                  {eligibleItems.length > 0 && (
                    <button
                      type="button"
                      onClick={addPredRow}
                      className="mt-4 flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900 transition-colors"
                    >
                      <Plus size={14} className="text-gold-500" />
                      Add Predecessor
                    </button>
                  )}

                  {/* Lag note */}
                  {preds.some(p => p.lag_days !== 0) && (
                    <p className="mt-3 text-[10px] text-gray-400">
                      Positive lag = delay after the relationship. Negative lag = overlap.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-6 mb-4">
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            </div>
          )}

          {/* Actions — always visible at bottom */}
          <div className="px-6 pb-6 pt-2 flex gap-3 shrink-0">
            {isEdit && canDelete && (
              <button
                type="button"
                onClick={deleteItem}
                disabled={deleting}
                className="border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-60 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : form.type === 'milestone' ? 'Add Milestone' : 'Add Phase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
