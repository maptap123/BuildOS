'use client'

import { useCallback, useState } from 'react'
import type { Contact } from '@/types'

export function useContacts(jobId?: string | null, initialContacts: Contact[] = []) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = jobId ? `/api/contacts?job_id=${jobId}` : '/api/contacts'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load contacts')
      setContacts(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  return { contacts, loading, error, refresh }
}
