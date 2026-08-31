'use client'

import { useState } from 'react'
import { CalendarPlus, Check, Download, X } from 'lucide-react'
import type { AssignmentStatus } from '@/lib/schedule/assignments'

interface Props {
  token: string
  initialStatus: AssignmentStatus
  icsUrl: string
  googleUrl: string
}

export function AppointmentActions({ token, initialStatus, icsUrl, googleUrl }: Props) {
  const [status, setStatus] = useState<AssignmentStatus>(initialStatus)
  const [note, setNote] = useState('')
  const [showDecline, setShowDecline] = useState(false)
  const [saving, setSaving] = useState<'confirm' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(action: 'confirm' | 'decline') {
    setSaving(action)
    setError(null)
    try {
      const res = await fetch(`/api/appt/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStatus(action === 'confirm' ? 'confirmed' : 'declined')
      setShowDecline(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  if (status === 'confirmed') {
    return (
      <div className="mt-5">
        <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-100 text-green-700 rounded-xl py-3 text-sm font-semibold">
          <Check size={16} />
          You&apos;re confirmed
        </div>

        <p className="text-center text-xs text-gray-400 mt-5 mb-2">Add it to your calendar</p>
        <div className="space-y-2">
          <a
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold py-3.5 rounded-xl transition-colors"
          >
            <CalendarPlus size={16} />
            Google Calendar
          </a>
          <a
            href={icsUrl}
            className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 hover:bg-gray-50 text-navy-800 text-sm font-semibold py-3.5 rounded-xl transition-colors"
          >
            <Download size={16} />
            Apple / Outlook (.ics)
          </a>
        </div>

        <button
          onClick={() => setShowDecline(true)}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-5 transition-colors"
        >
          Something changed — I can&apos;t make it
        </button>

        {showDecline && (
          <DeclineBox
            note={note}
            setNote={setNote}
            saving={saving === 'decline'}
            onCancel={() => setShowDecline(false)}
            onSubmit={() => respond('decline')}
          />
        )}
        {error && <p className="text-sm text-red-600 text-center mt-3">{error}</p>}
      </div>
    )
  }

  if (status === 'declined') {
    return (
      <div className="mt-5">
        <div className="flex items-center justify-center gap-2 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold">
          <X size={16} />
          Marked as unavailable
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          The JDC team has been notified and will follow up.
        </p>
        <button
          onClick={() => respond('confirm')}
          disabled={saving !== null}
          className="w-full text-center text-xs text-gold-600 hover:text-gold-700 mt-4 font-medium transition-colors disabled:opacity-60"
        >
          {saving === 'confirm' ? 'Updating…' : 'Actually, I can make it'}
        </button>
        {error && <p className="text-sm text-red-600 text-center mt-3">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-5">
      {!showDecline ? (
        <div className="space-y-2">
          <button
            onClick={() => respond('confirm')}
            disabled={saving !== null}
            className="flex items-center justify-center gap-2 w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-base font-semibold py-4 rounded-xl transition-colors"
          >
            <Check size={18} />
            {saving === 'confirm' ? 'Confirming…' : "Yes, I'll be there"}
          </button>
          <button
            onClick={() => setShowDecline(true)}
            disabled={saving !== null}
            className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-600 text-base font-semibold py-4 rounded-xl transition-colors"
          >
            <X size={18} />
            Can&apos;t make it
          </button>
        </div>
      ) : (
        <DeclineBox
          note={note}
          setNote={setNote}
          saving={saving === 'decline'}
          onCancel={() => setShowDecline(false)}
          onSubmit={() => respond('decline')}
        />
      )}
      {error && <p className="text-sm text-red-600 text-center mt-3">{error}</p>}
    </div>
  )
}

function DeclineBox({
  note,
  setNote,
  saving,
  onCancel,
  onSubmit,
}: {
  note: string
  setNote: (v: string) => void
  saving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="mt-3 bg-white border border-gray-100 rounded-xl p-4">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Anything we should know? (optional)
      </label>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        placeholder="e.g. tied up on another job until Thursday"
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-3 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          className="flex-1 bg-navy-900 hover:bg-navy-800 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-lg transition-colors"
        >
          {saving ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
