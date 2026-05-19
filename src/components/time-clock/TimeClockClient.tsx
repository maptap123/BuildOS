'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, Play, Square, ChevronRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { TimeEntry } from '@/types'

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

interface Props {
  currentUserId: string
  currentUser: UserProfile | null
  initialEntries: EntryWithJob[]
  activeJobs: Job[]
  isAdmin: boolean
}

// Common cost codes matching BT's structure
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

function totalHours(entries: EntryWithJob[]): number {
  return entries.reduce((sum, e) => sum + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0)
}

type Step = 'idle' | 'pick-job' | 'pick-code' | 'active'

export function TimeClockClient({ currentUserId, currentUser, initialEntries, activeJobs, isAdmin }: Props) {
  const [entries, setEntries] = useState<EntryWithJob[]>(initialEntries)
  const [step, setStep] = useState<Step>(() => {
    const open = initialEntries.find(e => !e.clock_out)
    return open ? 'active' : 'idle'
  })
  const [activeEntry, setActiveEntry] = useState<EntryWithJob | null>(
    () => initialEntries.find(e => !e.clock_out) ?? null
  )
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedCode, setSelectedCode] = useState('')
  const [jobSearch, setJobSearch] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tick elapsed timer for active shift
  useEffect(() => {
    if (!activeEntry) return
    const tick = () => setElapsed(Date.now() - new Date(activeEntry.clock_in).getTime())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeEntry])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/time-entries?user_id=${currentUserId}&date_from=${new Date().toISOString().split('T')[0]}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data)
      const open = data.find((e: EntryWithJob) => !e.clock_out)
      setActiveEntry(open ?? null)
      setStep(open ? 'active' : 'idle')
    }
  }, [currentUserId])

  async function clockIn() {
    if (!selectedJob) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: selectedJob.id,
          clock_in: new Date().toISOString(),
          cost_code: selectedCode || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Clock in failed')
      await refresh()
      setSelectedJob(null)
      setSelectedCode('')
      setJobSearch('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clock in failed')
    } finally {
      setLoading(false)
    }
  }

  async function clockOut() {
    if (!activeEntry) return
    setLoading(true)
    setError(null)
    try {
      const clockOut = new Date().toISOString()
      const clockIn = new Date(activeEntry.clock_in)
      const totalMs = new Date(clockOut).getTime() - clockIn.getTime()
      const totalHrs = totalMs / 3_600_000
      const regularHours = Math.min(totalHrs, 8)
      const overtimeHours = Math.max(0, totalHrs - 8)

      const res = await fetch(`/api/time-entries/${activeEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clock_out: clockOut,
          regular_hours: Math.round(regularHours * 100) / 100,
          overtime_hours: Math.round(overtimeHours * 100) / 100,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Clock out failed')
      await refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clock out failed')
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs = activeJobs.filter(j =>
    j.name.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.job_number.toLowerCase().includes(jobSearch.toLowerCase())
  )

  const todayTotal = totalHours(entries.filter(e => e.clock_out))

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-navy-900">Time Clock</h1>
          <p className="text-sm text-gray-500">
            {currentUser?.full_name ?? 'My Shifts'} &middot; Today: {todayTotal.toFixed(2)}h
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/time-clock/shifts"
            className="text-sm text-navy-600 hover:text-navy-900 flex items-center gap-1"
          >
            All Shifts <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── ACTIVE SHIFT BANNER ── */}
      {step === 'active' && activeEntry && (
        <div className="bg-navy-900 text-white rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-navy-300 text-xs font-medium tracking-widest uppercase mb-1">Clocked In</p>
              <p className="font-display text-2xl font-bold tracking-tight">{formatDuration(elapsed)}</p>
              <p className="text-navy-200 text-sm mt-1">{activeEntry.job?.name ?? 'Unknown Job'}</p>
              {activeEntry.cost_code && (
                <p className="text-gold-400 text-xs mt-0.5">{activeEntry.cost_code}</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Live</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-navy-400">
            <Clock size={12} />
            Started at {formatTime(activeEntry.clock_in)}
          </div>

          <div className="flex gap-3">
            <button
              onClick={clockOut}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <Square size={16} fill="currentColor" />
              {loading ? 'Clocking Out…' : 'Clock Out'}
            </button>
            <button
              onClick={() => { setStep('pick-job'); setSelectedJob(null); setJobSearch('') }}
              className="flex items-center justify-center gap-1 bg-navy-800 hover:bg-navy-700 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
            >
              Switch Job
            </button>
          </div>
        </div>
      )}

      {/* ── IDLE: CLOCK IN BUTTON ── */}
      {step === 'idle' && (
        <button
          onClick={() => setStep('pick-job')}
          className="w-full flex items-center justify-center gap-3 bg-gold-500 hover:bg-gold-600 text-navy-900 font-bold text-lg py-5 rounded-2xl transition-colors shadow-sm"
        >
          <Play size={22} fill="currentColor" />
          Clock In
        </button>
      )}

      {/* ── STEP 1: PICK JOB ── */}
      {step === 'pick-job' && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-navy-900">Select Job</h2>
            <button
              onClick={() => setStep('idle')}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Cancel
            </button>
          </div>
          <div className="px-4 py-2 border-b border-border">
            <input
              type="search"
              placeholder="Search jobs…"
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              autoFocus
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-navy-400"
            />
          </div>
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {filteredJobs.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No active jobs found</p>
            )}
            {filteredJobs.map(job => (
              <button
                key={job.id}
                onClick={() => { setSelectedJob(job); setStep('pick-code') }}
                className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-navy-900 text-sm">{job.name}</p>
                <p className="text-xs text-gray-400">{job.job_number}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: PICK COST CODE ── */}
      {step === 'pick-code' && selectedJob && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy-900">Cost Code</h2>
              <p className="text-xs text-gray-400 mt-0.5">{selectedJob.name}</p>
            </div>
            <button
              onClick={() => setStep('pick-job')}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Back
            </button>
          </div>
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            <button
              onClick={() => { setSelectedCode(''); clockIn() }}
              disabled={loading}
              className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm text-gray-500 italic">No cost code</p>
            </button>
            {COST_CODES.map(code => (
              <button
                key={code}
                onClick={() => { setSelectedCode(code); clockIn() }}
                disabled={loading}
                className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <p className="text-sm text-navy-900">{code}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── TODAY'S COMPLETED SHIFTS ── */}
      {entries.filter(e => e.clock_out).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
            Today&apos;s Shifts
          </h2>
          <div className="space-y-2">
            {entries.filter(e => e.clock_out).map(entry => {
              const hrs = (entry.regular_hours ?? 0) + (entry.overtime_hours ?? 0)
              return (
                <div
                  key={entry.id}
                  className="bg-white border border-border rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{entry.job?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatTime(entry.clock_in)} – {formatTime(entry.clock_out!)}
                      {entry.cost_code && <span className="ml-2 text-navy-500">{entry.cost_code}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-sm font-semibold text-navy-900">{hrs.toFixed(2)}h</span>
                    {entry.approval_status === 'approved' && (
                      <CheckCircle size={14} className="text-green-500" />
                    )}
                    {entry.approval_status === 'rejected' && (
                      <XCircle size={14} className="text-red-500" />
                    )}
                    {entry.approval_status === 'pending' && (
                      <Clock size={14} className="text-amber-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && step === 'idle' && (
        <div className="text-center py-12 text-gray-400">
          <Clock size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No shifts today. Tap Clock In to start.</p>
        </div>
      )}
    </div>
  )
}
