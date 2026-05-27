'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock, Play, Square, MapPin, MapPinOff, ChevronRight,
  CheckCircle, XCircle, AlertCircle, Loader2, Pencil, X,
} from 'lucide-react'
import Link from 'next/link'
import { useActiveJob } from '@/contexts/ActiveJobContext'
import type { TimeEntry } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface Job {
  id: string
  name: string
  job_number: string
  status: string
}

interface UserProfile {
  id: string
  full_name: string | null
  hourly_rate: number | null
  overtime_rate: number | null
}

interface EntryWithJob extends TimeEntry {
  job?: { id: string; name: string } | null
}

// No more 'picking-code' — cost code is set after clock-in
type Step = 'idle' | 'picking-job' | 'active' | 'clocking-out'

type LocStatus = 'idle' | 'requesting' | 'captured' | 'denied' | 'unavailable' | 'skipped'
interface LocState {
  status: LocStatus
  lat?: number
  lng?: number
  accuracy?: number
}

interface Props {
  currentUserId: string
  currentUser: UserProfile | null
  initialEntries: EntryWithJob[]
  activeJobs: Job[]
  isAdmin: boolean
  weekTotalHours: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COST_CODES = [
  '01 Plans & Permits',
  '02 Site Prep',
  '03 Demolition',
  '04 Concrete',
  '05 Masonry',
  '06 Floor Framing',
  '07 Wall Framing',
  '08 Roof Framing',
  '09 Roofing',
  '10 Exterior Trim',
  '11 Siding',
  '12 Doors & Windows',
  '13 Insulation',
  '14 Plumbing',
  '15 HVAC',
  '16 Electrical',
  '17 Drywall',
  '18 Interior Trim',
  '19 Cabinets & Counters',
  '20 Flooring',
  '21 Painting',
  '22 Tile',
  '23 Landscaping',
  '24 Cleanup',
  '25 General Labor',
  '26 Equipment & Tools',
  '27 Supervision',
]

const BREAK_PRESETS = [0, 15, 30, 45, 60]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function sumHours(entries: EntryWithJob[]): number {
  return entries.reduce((sum, e) => sum + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0)
}

// Normalise any non-final LocState to 'skipped' before writing to the DB
function finalLoc(loc: LocState): LocState {
  if (loc.status === 'captured' || loc.status === 'denied' || loc.status === 'unavailable') {
    return loc
  }
  return { status: 'skipped' }
}

// ─── GPS helper ───────────────────────────────────────────────────────────────

function captureLocation(timeoutMs = 9000): Promise<LocState> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve({ status: 'unavailable' })
    }
    const timer = setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        resolve({
          status: 'captured',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        clearTimeout(timer)
        resolve({ status: err.code === 1 ? 'denied' : 'unavailable' })
      },
      { enableHighAccuracy: false, timeout: timeoutMs - 1000, maximumAge: 30_000 },
    )
  })
}

// ─── LocationBadge ────────────────────────────────────────────────────────────

function LocationBadge({ status }: { status: LocStatus | string | null }) {
  if (status === 'captured') {
    return (
      <span className="flex items-center gap-1 text-emerald-400">
        <MapPin size={10} />
        <span>Location saved</span>
      </span>
    )
  }
  if (status === 'denied') {
    return (
      <span className="flex items-center gap-1 text-amber-300">
        <MapPinOff size={10} />
        <span>Location denied</span>
      </span>
    )
  }
  if (status === 'requesting') {
    return (
      <span className="flex items-center gap-1 text-navy-300 animate-pulse">
        <MapPin size={10} />
        <span>Getting location…</span>
      </span>
    )
  }
  return null
}

// ─── CostCodeSheet ────────────────────────────────────────────────────────────
// Reusable bottom sheet for selecting (or clearing) a cost code

interface CostCodeSheetProps {
  current: string | null
  saving?: boolean
  onSelect: (code: string) => void
  onClose: () => void
}

function CostCodeSheet({ current, saving, onSelect, onClose }: CostCodeSheetProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <h3 className="font-display font-bold text-navy-900 text-base">Cost Code</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>
        {/* Options */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100 pb-8">
          {/* Clear/none */}
          <button
            onClick={() => onSelect('')}
            disabled={saving}
            className={`w-full text-left px-4 py-4 hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between disabled:opacity-50 ${!current ? 'bg-gold-50' : ''}`}
          >
            <span className="text-sm text-gray-400 italic">No cost code</span>
            {!current && <div className="w-2 h-2 rounded-full bg-gold-500" />}
          </button>
          {COST_CODES.map((code) => (
            <button
              key={code}
              onClick={() => onSelect(code)}
              disabled={saving}
              className={`w-full text-left px-4 py-4 hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between disabled:opacity-50 ${current === code ? 'bg-gold-50' : ''}`}
            >
              <span className="text-sm font-medium text-navy-900">{code}</span>
              {current === code && <div className="w-2 h-2 rounded-full bg-gold-500" />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimeClockClient({
  currentUserId,
  currentUser,
  initialEntries,
  activeJobs,
  isAdmin,
  weekTotalHours,
}: Props) {
  // Active job context — shared with the layout picker
  const { activeJob, activeJobId } = useActiveJob()

  const [entries, setEntries] = useState<EntryWithJob[]>(initialEntries)
  const [step, setStep] = useState<Step>(() =>
    initialEntries.find((e) => !e.clock_out) ? 'active' : 'idle',
  )
  const [activeEntry, setActiveEntry] = useState<EntryWithJob | null>(
    () => initialEntries.find((e) => !e.clock_out) ?? null,
  )
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [jobSearch, setJobSearch] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clock-out form
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [clockOutNotes, setClockOutNotes] = useState('')

  // GPS
  const [clockInLoc, setClockInLoc] = useState<LocState>({ status: 'idle' })
  const [clockOutLoc, setClockOutLoc] = useState<LocState>({ status: 'idle' })

  // Cost code editing
  const [editingCostCode, setEditingCostCode] = useState(false)     // on active entry
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null) // on a completed entry
  const [savingCode, setSavingCode] = useState(false)

  // ── Live timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEntry) return
    const tick = () => setElapsed(Date.now() - new Date(activeEntry.clock_in).getTime())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeEntry])

  // ── Refresh today's entries ─────────────────────────────────────────────────
  const refresh = useCallback(async (): Promise<EntryWithJob | null> => {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/time-entries?user_id=${currentUserId}&date_from=${today}`)
    if (res.ok) {
      const data: EntryWithJob[] = await res.json()
      setEntries(data)
      const open = data.find((e) => !e.clock_out) ?? null
      setActiveEntry(open)
      return open
    }
    return null
  }, [currentUserId])

  // ── Clock In ────────────────────────────────────────────────────────────────
  // Takes the job explicitly — no more picking a code first.
  async function clockIn(job: Job, code: string) {
    setLoading(true)
    setError(null)
    try {
      const loc = finalLoc(clockInLoc)
      const body: Record<string, unknown> = {
        job_id: job.id,
        clock_in: new Date().toISOString(),
        cost_code: code || null,
        location_status: loc.status,
        device_info:
          typeof navigator !== 'undefined'
            ? { userAgent: navigator.userAgent }
            : null,
      }
      if (loc.status === 'captured') {
        body.clock_in_latitude = loc.lat
        body.clock_in_longitude = loc.lng
        body.clock_in_accuracy_meters = loc.accuracy
      }
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Clock in failed')
      await refresh()
      setStep('active')
      setClockInLoc({ status: 'idle' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clock in failed')
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  // ── Start clock-in flow ─────────────────────────────────────────────────────
  // Active job context → clock in immediately (no picker, no code step).
  // No context → show job picker.
  function startClockInFlow() {
    // Always kick off GPS in background
    setClockInLoc({ status: 'requesting' })
    captureLocation().then(setClockInLoc)

    if (activeJobId && activeJob) {
      const job: Job = {
        id: activeJobId,
        name: activeJob.name,
        job_number: activeJob.job_number,
        status: activeJob.status,
      }
      setSelectedJob(job)
      clockIn(job, '')
    } else {
      // No active job — show picker
      setStep('picking-job')
      setSelectedJob(null)
      setJobSearch('')
    }
  }

  // ── Open job picker to change the job (from idle or from "Change" link) ─────
  function openJobPicker() {
    setStep('picking-job')
    setJobSearch('')
    // Start GPS now so it's ready when the user picks
    setClockInLoc({ status: 'requesting' })
    captureLocation().then(setClockInLoc)
  }

  // ── Start clock-out form ────────────────────────────────────────────────────
  function startClockOutFlow() {
    setBreakMinutes(0)
    setClockOutNotes('')
    setStep('clocking-out')
    setClockOutLoc({ status: 'requesting' })
    captureLocation().then(setClockOutLoc)
  }

  // ── Update cost code on any entry ───────────────────────────────────────────
  async function updateCostCode(entryId: string, code: string) {
    setSavingCode(true)
    setError(null)
    try {
      const res = await fetch(`/api/time-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_code: code || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed')
      await refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingCode(false)
      setEditingCostCode(false)
      setEditingShiftId(null)
    }
  }

  // ── Clock Out ───────────────────────────────────────────────────────────────
  async function performClockOut(opts: {
    breakMins: number
    notes: string
    loc: LocState
    thenSwitch?: boolean
  }): Promise<boolean> {
    if (!activeEntry) return false
    setLoading(true)
    setError(null)
    try {
      const loc = finalLoc(opts.loc)
      const body: Record<string, unknown> = {
        clock_out: new Date().toISOString(),
        break_minutes: opts.breakMins,
        notes: opts.notes || null,
      }
      if (loc.status === 'captured') {
        body.clock_out_latitude = loc.lat
        body.clock_out_longitude = loc.lng
        body.clock_out_accuracy_meters = loc.accuracy
      }
      const res = await fetch(`/api/time-entries/${activeEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Clock out failed')
      await refresh()
      if (opts.thenSwitch) {
        // Switch job: immediately start a new clock-in flow
        setStep('picking-job')
        setSelectedJob(null)
        setJobSearch('')
        setClockInLoc({ status: 'requesting' })
        captureLocation().then(setClockInLoc)
      } else {
        setStep('idle')
        setClockOutLoc({ status: 'idle' })
        setBreakMinutes(0)
        setClockOutNotes('')
      }
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clock out failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  // ── Switch job ──────────────────────────────────────────────────────────────
  async function switchJob() {
    await performClockOut({
      breakMins: 0,
      notes: '',
      loc: { status: 'skipped' },
      thenSwitch: true,
    })
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const completedToday = entries.filter((e) => e.clock_out)
  const todayTotal = sumHours(completedToday)
  const filteredJobs = activeJobs.filter(
    (j) =>
      j.name.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.job_number.toLowerCase().includes(jobSearch.toLowerCase()),
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-4 pb-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Time Clock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentUser?.full_name ?? 'My Time'}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs font-semibold text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full">
              Today: {todayTotal.toFixed(2)}h
            </span>
            <span className="text-xs font-semibold text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full">
              Week: {weekTotalHours.toFixed(2)}h
            </span>
          </div>
        </div>
        {isAdmin && (
          <Link
            href="/time-clock/shifts"
            className="flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-900 transition-colors mt-1"
          >
            Manage Shifts
            <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {/* ──────────────────────────────────────────────
          ACTIVE SHIFT CARD  (step: active | clocking-out)
          ────────────────────────────────────────────── */}
      {(step === 'active' || step === 'clocking-out') && activeEntry && (
        <div className="bg-navy-900 text-white rounded-2xl p-5 shadow-lg space-y-4">

          {/* Timer */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-navy-400 tracking-widest uppercase mb-2">
                Clocked In
              </p>
              <p className="font-display text-5xl font-black tabular-nums tracking-tight leading-none">
                {formatDuration(elapsed)}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-400 bg-green-400/15 px-2.5 py-1.5 rounded-full mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>

          {/* Job name + cost code (editable while active) */}
          <div>
            <p className="font-semibold text-white text-lg leading-tight">
              {activeEntry.job?.name ?? 'Unknown Job'}
            </p>

            {step === 'active' ? (
              /* Tappable cost code row */
              <button
                onClick={() => setEditingCostCode(true)}
                className="flex items-center gap-1.5 mt-1 group"
              >
                {activeEntry.cost_code ? (
                  <span className="text-gold-400 text-sm">{activeEntry.cost_code}</span>
                ) : (
                  <span className="text-navy-400 text-sm italic">Tap to add cost code</span>
                )}
                <Pencil
                  size={11}
                  className="text-navy-600 group-hover:text-navy-300 transition-colors shrink-0"
                />
              </button>
            ) : (
              /* During clock-out form: show but still editable via sheet */
              activeEntry.cost_code ? (
                <p className="text-gold-400 text-sm mt-0.5">{activeEntry.cost_code}</p>
              ) : (
                <p className="text-navy-400 text-sm mt-0.5 italic">No cost code</p>
              )
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-navy-400">
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              Started {formatTime(activeEntry.clock_in)}
            </span>
            <LocationBadge status={activeEntry.location_status} />
          </div>

          {/* ── Active buttons ── */}
          {step === 'active' && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={startClockOutFlow}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold text-lg py-4 rounded-xl transition-colors disabled:opacity-50"
              >
                <Square size={18} fill="currentColor" />
                Clock Out
              </button>
              <button
                onClick={switchJob}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 bg-navy-800 hover:bg-navy-700 active:bg-navy-600 text-white text-sm font-semibold px-5 py-4 rounded-xl transition-colors disabled:opacity-50 min-w-[100px]"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  'Switch Job'
                )}
              </button>
            </div>
          )}

          {/* ── Clock-out form ── */}
          {step === 'clocking-out' && (
            <div className="space-y-4 pt-3 border-t border-navy-700">
              <p className="text-sm font-bold text-navy-200">Clock Out Details</p>

              {/* Cost code — review/edit before confirming */}
              <div>
                <label className="text-xs text-navy-400 font-medium mb-1.5 block">
                  Cost code
                </label>
                <button
                  type="button"
                  onClick={() => setEditingCostCode(true)}
                  className="w-full flex items-center justify-between bg-navy-800 border border-navy-600 rounded-xl px-3 py-2.5 hover:border-gold-400 transition-colors"
                >
                  <span className={`text-sm ${activeEntry.cost_code ? 'text-white' : 'text-navy-400 italic'}`}>
                    {activeEntry.cost_code || 'No cost code — tap to add'}
                  </span>
                  <Pencil size={13} className="text-navy-400 shrink-0" />
                </button>
              </div>

              {/* Break time */}
              <div>
                <label className="text-xs text-navy-400 font-medium mb-2 block">
                  Break time
                </label>
                <div className="flex gap-2 flex-wrap">
                  {BREAK_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBreakMinutes(m)}
                      className={`text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors ${
                        breakMinutes === m
                          ? 'bg-gold-500 border-gold-400 text-navy-900'
                          : 'bg-navy-800 border-navy-600 text-navy-200 hover:border-gold-500'
                      }`}
                    >
                      {m === 0 ? 'None' : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-navy-400 font-medium mb-1.5 block">
                  Notes <span className="text-navy-500">(optional)</span>
                </label>
                <textarea
                  value={clockOutNotes}
                  onChange={(e) => setClockOutNotes(e.target.value)}
                  placeholder="What did you work on? Any issues?"
                  rows={2}
                  className="w-full bg-navy-800 border border-navy-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-navy-500 outline-none focus:border-gold-400 resize-none"
                />
              </div>

              {/* Location status */}
              <div className="flex items-center justify-between text-xs text-navy-400">
                <span>Clock-out location:</span>
                <LocationBadge status={clockOutLoc.status} />
              </div>

              {/* Confirm */}
              <button
                onClick={() =>
                  performClockOut({
                    breakMins: breakMinutes,
                    notes: clockOutNotes,
                    loc: clockOutLoc,
                  })
                }
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold text-lg py-4 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Square size={17} fill="currentColor" />
                    Confirm Clock Out
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setStep('active')}
                disabled={loading}
                className="w-full text-center text-sm text-navy-400 hover:text-navy-200 transition-colors py-1.5"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────
          IDLE: Clock In
          If active job context is set, show it above the button.
          Tapping Clock In clocks in immediately — no pickers.
          ────────────────────────────────────────────── */}
      {step === 'idle' && (
        <div className="space-y-3">

          {/* Active job context — shown when a job is already selected */}
          {activeJobId && activeJob ? (
            <div className="flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                  Clocking in to
                </p>
                <p className="font-semibold text-navy-900 truncate">{activeJob.name}</p>
              </div>
              <button
                onClick={openJobPicker}
                className="text-sm font-medium text-navy-500 hover:text-navy-900 transition-colors shrink-0 ml-4"
              >
                Change
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400 pb-1">
              You&apos;ll be asked to select a job
            </p>
          )}

          <button
            onClick={startClockInFlow}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-gold-500 hover:bg-gold-600 active:bg-gold-700 text-navy-900 font-black text-2xl py-7 rounded-2xl transition-colors shadow-sm select-none disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={28} className="animate-spin" />
            ) : (
              <>
                <Play size={28} fill="currentColor" />
                Clock In
              </>
            )}
          </button>
        </div>
      )}

      {/* ──────────────────────────────────────────────
          PICK JOB
          Shown when no active context, or user tapped "Change".
          Selecting a job clocks in immediately — no code step.
          ────────────────────────────────────────────── */}
      {step === 'picking-job' && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-bold text-navy-900 text-base">Select Job</h2>
              <p className="text-xs text-gray-400 mt-0.5">Which job are you clocking in to?</p>
            </div>
            <button
              onClick={() => setStep('idle')}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium px-2 py-1"
            >
              Cancel
            </button>
          </div>

          <div className="px-4 py-3 border-b border-border">
            <input
              type="search"
              placeholder="Search by name or job #…"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              autoFocus
              className="w-full text-base bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-navy-400 focus:bg-white"
            />
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {filteredJobs.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-10">
                No active jobs found
              </p>
            )}
            {filteredJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => {
                  setSelectedJob(job)
                  clockIn(job, '')
                }}
                disabled={loading}
                className={`w-full text-left px-4 py-4 hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between gap-3 disabled:opacity-50 ${
                  job.id === activeJobId ? 'bg-gold-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900 truncate">{job.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{job.job_number}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {job.id === activeJobId && (
                    <span className="text-[10px] font-bold text-gold-600 bg-gold-50 px-2 py-0.5 rounded-full border border-gold-200">
                      Context
                    </span>
                  )}
                  {loading && selectedJob?.id === job.id ? (
                    <Loader2 size={15} className="text-navy-400 animate-spin" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-300" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* GPS status footer */}
          <div className="px-4 py-3 border-t border-border bg-gray-50 flex items-center justify-between text-xs text-gray-400">
            <span>Clock-in location:</span>
            <LocationBadge status={clockInLoc.status} />
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────
          TODAY'S COMPLETED SHIFTS
          Cost code is editable inline with the pencil icon.
          ────────────────────────────────────────────── */}
      {completedToday.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
            Today&apos;s Shifts
          </h2>
          <div className="space-y-2">
            {completedToday.map((entry) => {
              const hrs = (entry.regular_hours ?? 0) + (entry.overtime_hours ?? 0)
              const hasOT = (entry.overtime_hours ?? 0) > 0
              return (
                <div
                  key={entry.id}
                  className="bg-white border border-border rounded-xl px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy-900 truncate">
                        {entry.job?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatTime(entry.clock_in)} – {formatTime(entry.clock_out!)}
                        {entry.break_minutes > 0 && (
                          <span className="ml-2">{entry.break_minutes}m break</span>
                        )}
                      </p>

                      {/* Cost code — always shown, always tappable to edit */}
                      <button
                        onClick={() => setEditingShiftId(entry.id)}
                        className="flex items-center gap-1 mt-1.5 group"
                      >
                        {entry.cost_code ? (
                          <span className="text-xs font-medium text-navy-600">
                            {entry.cost_code}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Add cost code</span>
                        )}
                        <Pencil
                          size={10}
                          className="text-gray-300 group-hover:text-navy-400 transition-colors"
                        />
                      </button>

                      {entry.notes && (
                        <p className="text-xs text-gray-400 italic mt-0.5 truncate">
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-navy-900">{hrs.toFixed(2)}h</p>
                      {hasOT && (
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          +{(entry.overtime_hours ?? 0).toFixed(2)}h OT
                        </p>
                      )}
                      <div className="flex justify-end mt-1">
                        {entry.approval_status === 'approved' && (
                          <CheckCircle size={13} className="text-green-500" />
                        )}
                        {entry.approval_status === 'rejected' && (
                          <XCircle size={13} className="text-red-500" />
                        )}
                        {entry.approval_status === 'pending' && (
                          <Clock size={13} className="text-amber-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {entries.length === 0 && step === 'idle' && (
        <div className="text-center py-16 text-gray-400">
          <Clock size={44} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-semibold text-gray-500">No shifts today</p>
          <p className="text-xs text-gray-400 mt-1">Tap Clock In to start your shift</p>
        </div>
      )}

      {/* ── Cost code sheet — active entry ── */}
      {editingCostCode && activeEntry && (
        <CostCodeSheet
          current={activeEntry.cost_code ?? null}
          saving={savingCode}
          onSelect={(code) => updateCostCode(activeEntry.id, code)}
          onClose={() => setEditingCostCode(false)}
        />
      )}

      {/* ── Cost code sheet — completed entry ── */}
      {editingShiftId && (
        <CostCodeSheet
          current={
            completedToday.find((e) => e.id === editingShiftId)?.cost_code ?? null
          }
          saving={savingCode}
          onSelect={(code) => updateCostCode(editingShiftId, code)}
          onClose={() => setEditingShiftId(null)}
        />
      )}
    </div>
  )
}
