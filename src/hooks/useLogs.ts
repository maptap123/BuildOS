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

  const upsertLog = useCallback((log: DailyLog) => {
    setError(null)
    setLogs(current => {
      const rest = current.filter(item => item.id !== log.id)
      return [log, ...rest].sort((a, b) => {
        const byDate = b.log_date.localeCompare(a.log_date)
        if (byDate !== 0) return byDate
        return b.created_at.localeCompare(a.created_at)
      })
    })
  }, [])

  const removeLog = useCallback((id: string) => {
    setError(null)
    setLogs(current => current.filter(log => log.id !== id))
  }, [])

  return { logs, loading, error, refresh, upsertLog, removeLog }
}
