'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { JobStatus } from '@/types'
import { QuickBooksProjectSetup } from './QuickBooksProjectSetup'

const OPTIONS: { value: JobStatus; label: string; className: string }[] = [
  { value: 'lead',     label: 'Lead',     className: 'bg-gray-100 text-gray-600' },
  { value: 'presale',  label: 'Presale',  className: 'bg-blue-100 text-blue-700' },
  { value: 'active',   label: 'Active',   className: 'bg-emerald-100 text-emerald-700' },
  { value: 'warranty', label: 'Warranty', className: 'bg-amber-100 text-amber-700' },
  { value: 'closed',   label: 'Closed',   className: 'bg-gray-200 text-gray-500' },
]

export function JobStatusSelect({
  jobId,
  initialStatus,
  canEdit = true,
}: {
  jobId: string
  initialStatus: JobStatus
  canEdit?: boolean
}) {
  const [status, setStatus] = useState<JobStatus>(initialStatus)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [setup, setSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = OPTIONS.find(o => o.value === status) ?? OPTIONS[0]

  async function select(next: JobStatus, projectReviewed = false) {
    if (next === status) { setOpen(false); return }
    if (next === 'active' && !projectReviewed) { setOpen(false); setSetup(true); return }
    setOpen(false)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Status was not saved.')
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status was not saved.')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${current.className}`}>
        {current.label}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      {setup && <QuickBooksProjectSetup jobId={jobId} onDone={() => { setSetup(false); void select('active', true) }} />}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity ${current.className} ${saving ? 'opacity-50' : 'hover:opacity-80'}`}
      >
        {current.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-lg shadow-lg border border-border min-w-[110px] py-1">
          {OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => select(o.value)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors ${o.value === status ? 'opacity-50 cursor-default' : ''}`}
            >
              <span className={`inline-flex px-1.5 py-0.5 rounded-full ${o.className}`}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
