'use client'

import { useCallback, useState } from 'react'
import type { DailyLog } from '@/types'

export function useLogs(jobId: string, initialLogs: DailyLog[] = []) {
  const [logs, setLogs] = useState<DailyLog[]>(initialLogs)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/logs?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load logs')
      setLogs(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  return { logs, loading, error, refresh }
}
