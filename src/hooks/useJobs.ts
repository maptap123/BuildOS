'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Job } from '@/types'

interface UseJobsOptions {
  statuses?: string[]
  search?: string
  tags?: string[]
  manager_id?: string | null
}

export function useJobs({ statuses, search, tags, manager_id }: UseJobsOptions = {}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filters often change right after mount (saved defaults load async), so an
  // older, slower unfiltered fetch can land after the filtered one. Only the
  // latest request is allowed to write state.
  const latestRequest = useRef(0)

  const fetchJobs = useCallback(async () => {
    const requestId = ++latestRequest.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      statuses?.forEach(s => { if (s.trim()) params.append('status', s.trim()) })
      if (search?.trim()) params.set('search', search.trim())
      tags?.forEach(t => { if (t.trim()) params.append('tag', t.trim()) })
      if (manager_id) params.set('manager_id', manager_id)

      const res = await fetch(`/api/jobs${params.size ? `?${params}` : ''}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }

      const data = await res.json()
      if (requestId !== latestRequest.current) return
      setJobs(data)
    } catch (e) {
      if (requestId !== latestRequest.current) return
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses?.join(','), search, tags?.join(','), manager_id])

  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  return { jobs, loading, error, refresh: fetchJobs }
}
