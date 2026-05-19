'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Job } from '@/types'

interface UseJobsOptions {
  status?: string
  search?: string
  tags?: string[]
  manager_id?: string | null
}

export function useJobs({ status, search, tags, manager_id }: UseJobsOptions = {}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (search?.trim()) params.set('search', search.trim())
      tags?.forEach(t => { if (t.trim()) params.append('tag', t.trim()) })
      if (manager_id) params.set('manager_id', manager_id)

      const res = await fetch(`/api/jobs${params.size ? `?${params}` : ''}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }

      setJobs(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, tags?.join(','), manager_id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchJobs()
  }, [fetchJobs])

  return { jobs, loading, error, refresh: fetchJobs }
}
