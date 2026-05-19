'use client'

import { useCallback, useState } from 'react'
import type { ScheduleItem } from '@/types'

export function useSchedule(jobId: string, initialItems: ScheduleItem[] = []) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load schedule')
      setItems(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  return { items, loading, error, refresh }
}
