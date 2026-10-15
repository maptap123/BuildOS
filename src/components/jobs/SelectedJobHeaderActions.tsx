'use client'

import { useEffect, useState } from 'react'
import { JobHeaderActions } from './JobHeaderActions'

type Contact = { phone: string | null; address: string | null; cityStateZip: string | null }
const EMPTY: Contact = { phone: null, address: null, cityStateZip: null }

/** Remount on selection changes: never show the previous homeowner's number. */
export function SelectedJobHeaderActions({ jobId, variant = 'dark' }: { jobId: string | null; variant?: 'dark' | 'light' }) {
  return jobId ? <ContactActions key={jobId} jobId={jobId} variant={variant} /> : null
}

function ContactActions({ jobId, variant }: { jobId: string; variant: 'dark' | 'light' }) {
  const [contact, setContact] = useState<Contact>(EMPTY)
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    fetch(`/api/jobs/${encodeURIComponent(jobId)}?contact=1`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (current && data) setContact(data) })
      .catch(() => { /* Missing/denied data leaves both actions disabled. */ })
    return () => { current = false; controller.abort() }
  }, [jobId])
  return <JobHeaderActions {...contact} compact variant={variant} />
}
