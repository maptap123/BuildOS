'use client'

import { useEffect, useState } from 'react'
import { X, Send, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { defaultPayPeriod, hhmm, periodLabel } from '@/lib/payroll'

interface Summary {
  employees: number
  shifts: number
  totalMinutes: number
  openCount: number
  unapprovedCount: number
}

export function PreparePayrollModal({ onClose }: { onClose: () => void }) {
  const initial = defaultPayPeriod()
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ mailbox: string; recipient: string } | null>(null)

  const validRange = Boolean(start && end && end >= start)

  useEffect(() => {
    if (!validRange) { setSummary(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/time-clock/prepare-payroll?start=${start}&end=${end}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Failed to load summary')
        if (!cancelled) setSummary(j)
      })
      .catch((e) => { if (!cancelled) { setSummary(null); setError(e.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end, validRange])

  async function confirm() {
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/time-clock/prepare-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Failed to create draft')
      setDone({ mailbox: j.mailbox, recipient: j.recipient })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create draft')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display text-base font-bold text-navy-900">Prepare Payroll</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X size={18} /></button>
        </div>

        {done ? (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                Draft created in <b>{done.mailbox}</b> addressed to <b>{done.recipient}</b>. Open Outlook to review and send it.
              </span>
            </div>
            <button onClick={onClose} className="w-full text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 px-3 py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-gray-500">
              Pay period (defaults to last Monday–Sunday). Adjust if needed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-gray-500 space-y-1">
                Start
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                  className="block w-full text-sm font-normal border border-gray-200 rounded-lg px-3 py-1.5" />
              </label>
              <label className="text-xs font-semibold text-gray-500 space-y-1">
                End
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="block w-full text-sm font-normal border border-gray-200 rounded-lg px-3 py-1.5" />
              </label>
            </div>
            {!validRange && <p className="text-xs text-red-600">End date must be on or after the start date.</p>}

            {validRange && (
              <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 space-y-1">
                <div className="font-semibold text-navy-900">{periodLabel(start, end)}</div>
                {loading ? (
                  <div className="flex items-center gap-1.5 text-gray-400"><Loader2 size={13} className="animate-spin" /> Loading…</div>
                ) : summary ? (
                  <div>{summary.employees} employee{summary.employees === 1 ? '' : 's'} · {summary.shifts} shift{summary.shifts === 1 ? '' : 's'} · {hhmm(summary.totalMinutes)} total</div>
                ) : null}
                <div className="text-xs text-gray-500">
                  Email to teresa.applegate@elcorsolutions.com, saved as a draft in customerservice@jdcremodeling.com.
                </div>
              </div>
            )}

            {summary && summary.openCount > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {summary.openCount} shift{summary.openCount === 1 ? ' is' : 's are'} still clocked in and will NOT be included.
              </p>
            )}
            {summary && summary.unapprovedCount > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {summary.unapprovedCount} shift{summary.unapprovedCount === 1 ? ' is' : 's are'} not approved yet (still included).
              </p>
            )}
            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-lg">Cancel</button>
              <button
                onClick={confirm}
                disabled={!validRange || submitting || loading || !summary || summary.shifts === 0}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 px-3 py-2 rounded-lg disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
