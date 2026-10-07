'use client'

import { useState } from 'react'
import { X, Loader2, Trash2, AlertCircle } from 'lucide-react'
import type { TimeEntry } from '@/types'
import { COST_CODES } from './TimeClockClient'

// Manager-side editor for one shift. One sheet covers every manager action:
//   clock-in  — start a shift for a team member (optionally already finished)
//   clock-out — close someone's open shift
//   edit      — fix job, times, break, cost code, notes; or delete the shift

export type ShiftEditorMode = 'clock-in' | 'clock-out' | 'edit'

interface SimpleUser {
  id: string
  full_name: string | null
  email: string
}

interface SimpleJob {
  id: string
  name: string
  job_number: string
}

interface Props<T extends TimeEntry> {
  mode: ShiftEditorMode
  entry?: T | null
  users: SimpleUser[]
  jobs: SimpleJob[]
  onSaved: (entry: T) => void
  onDeleted?: (id: string) => void
  onClose: () => void
}

// <input type="datetime-local"> works in local time with no timezone
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}

function hoursBetween(inV: string, outV: string, breakMins: number): number | null {
  if (!inV || !outV) return null
  const ms = new Date(outV).getTime() - new Date(inV).getTime() - breakMins * 60_000
  return ms > 0 ? ms / 3_600_000 : null
}

const inputCls =
  'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-navy-400 focus:bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1'

export function ShiftEditor<T extends TimeEntry>({
  mode, entry, users, jobs, onSaved, onDeleted, onClose,
}: Props<T>) {
  const nowInput = toLocalInput(new Date())

  const [userId, setUserId] = useState(entry?.user_id ?? '')
  const [jobId, setJobId] = useState(entry?.job_id ?? '')
  const [clockIn, setClockIn] = useState(entry ? toLocalInput(new Date(entry.clock_in)) : nowInput)
  // Clocking out defaults to right now; editing keeps whatever is stored
  const [clockOut, setClockOut] = useState(
    mode === 'clock-out' ? nowInput : entry?.clock_out ? toLocalInput(new Date(entry.clock_out)) : '',
  )
  // Clock-in mode: tick this to enter a shift that has already ended
  const [finished, setFinished] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState(entry?.break_minutes ?? 0)
  const [costCode, setCostCode] = useState(entry?.cost_code ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpenShift = !!entry && !entry.clock_out
  const showClockOut = mode === 'clock-out' || (mode === 'edit' && (!isOpenShift || !!clockOut)) || (mode === 'clock-in' && finished)
  const showDetails = mode !== 'clock-out'
  const preview = showClockOut ? hoursBetween(clockIn, clockOut, breakMinutes) : null

  const title =
    mode === 'clock-in' ? 'Clock In Team Member'
    : mode === 'clock-out' ? 'Clock Out'
    : 'Edit Shift'

  // Job options: keep the shift's current job visible even if it's not in the list
  const jobOptions = jobs.some((j) => j.id === jobId) || !entry?.job
    ? jobs
    : [{ id: entry.job.id, name: entry.job.name, job_number: '' }, ...jobs]

  async function save() {
    setError(null)
    if (mode === 'clock-in' && !userId) return setError('Pick a team member.')
    if (showDetails && !jobId) return setError('Pick a job.')
    if (!clockIn) return setError('Set a clock-in time.')
    if (showClockOut && !clockOut) return setError('Set a clock-out time.')

    setSaving(true)
    try {
      let res: Response
      if (mode === 'clock-in') {
        res = await fetch('/api/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            job_id: jobId,
            clock_in: fromLocalInput(clockIn),
            clock_out: finished ? fromLocalInput(clockOut) : undefined,
            break_minutes: breakMinutes,
            cost_code: costCode || null,
            notes: notes.trim() || null,
            location_status: 'skipped',
            device_info: { source: 'manager', entered_by_manager: true },
          }),
        })
      } else {
        const body: Record<string, unknown> =
          mode === 'clock-out'
            ? { clock_out: fromLocalInput(clockOut), break_minutes: breakMinutes, notes: notes.trim() || null }
            : {
                job_id: jobId,
                clock_in: fromLocalInput(clockIn),
                break_minutes: breakMinutes,
                cost_code: costCode || null,
                notes: notes.trim() || null,
                ...(clockOut ? { clock_out: fromLocalInput(clockOut) } : {}),
              }
        res = await fetch(`/api/time-entries/${entry!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data as T)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!entry) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/time-entries/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed')
      onDeleted?.(entry.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={saving ? undefined : onClose} />
      <div className="fixed z-50 bg-white shadow-2xl flex flex-col max-h-[90vh] bottom-0 inset-x-0 rounded-t-2xl md:bottom-auto md:inset-x-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:rounded-2xl">
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 md:pt-4 shrink-0 border-b border-gray-100">
          <h3 className="font-display font-bold text-navy-900 text-base">{title}</h3>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3.5">
          {entry && mode !== 'clock-in' && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-navy-900">{entry.user?.full_name ?? 'Unknown'}</span>
              {entry.job?.name ? ` · ${entry.job.name}` : ''}
            </p>
          )}

          {entry?.qb_synced && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              Already synced to QuickBooks — changes here won&apos;t update QuickBooks.
            </div>
          )}

          {mode === 'clock-in' && (
            <div>
              <label className={labelCls}>Team member</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                ))}
              </select>
            </div>
          )}

          {showDetails && (
            <div>
              <label className={labelCls}>Job</label>
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>
          )}

          {mode !== 'clock-out' && (
            <div>
              <label className={labelCls}>Clock in</label>
              <input
                type="datetime-local"
                value={clockIn}
                max={nowInput}
                onChange={(e) => setClockIn(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {mode === 'clock-in' && (
            <label className="flex items-center gap-2 text-sm text-navy-900">
              <input
                type="checkbox"
                checked={finished}
                onChange={(e) => {
                  setFinished(e.target.checked)
                  if (e.target.checked && !clockOut) setClockOut(nowInput)
                }}
                className="w-4 h-4 accent-navy-900"
              />
              Shift already ended — enter the clock-out too
            </label>
          )}

          {mode === 'edit' && isOpenShift && !clockOut && (
            <button
              type="button"
              onClick={() => setClockOut(nowInput)}
              className="text-xs font-semibold text-navy-700 underline underline-offset-2"
            >
              Still clocked in — set a clock-out time
            </button>
          )}

          {showClockOut && (
            <div>
              <label className={labelCls}>Clock out</label>
              <input
                type="datetime-local"
                value={clockOut}
                min={clockIn}
                max={nowInput}
                onChange={(e) => setClockOut(e.target.value)}
                className={inputCls}
              />
              {mode === 'clock-out' && entry && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Clocked in {new Date(entry.clock_in).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {(showClockOut || mode === 'edit') && (
            <div>
              <label className={labelCls}>Break (minutes)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className={inputCls}
              />
            </div>
          )}

          {showDetails && (
            <div>
              <label className={labelCls}>Cost code</label>
              <select value={costCode} onChange={(e) => setCostCode(e.target.value)} className={inputCls}>
                <option value="">No cost code</option>
                {costCode && !COST_CODES.includes(costCode) && <option value={costCode}>{costCode}</option>}
                {COST_CODES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={mode === 'clock-out' ? 'e.g. Forgot to clock out — left at 4:30' : 'Optional'}
              className={`${inputCls} resize-none`}
            />
          </div>

          {preview != null && (
            <p className="text-sm text-navy-900">
              Total: <span className="font-bold">{preview.toFixed(2)}h</span>
              {preview > 8 && <span className="text-amber-600"> ({(preview - 8).toFixed(2)}h OT)</span>}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 py-3 pb-6 md:pb-3 flex items-center gap-2">
          {mode === 'edit' && onDeleted && (
            confirmDelete ? (
              <button
                onClick={remove}
                disabled={saving}
                className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-2.5 rounded-lg disabled:opacity-50"
              >
                Confirm delete
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-2.5 rounded-lg"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-semibold text-gray-500 px-4 py-2.5 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 px-5 py-2.5 rounded-lg disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {mode === 'clock-in' ? (finished ? 'Add Shift' : 'Clock In') : mode === 'clock-out' ? 'Clock Out' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
