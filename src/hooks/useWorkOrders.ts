'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkOrder } from '@/types'

export function useWorkOrders(jobId: string, initial: WorkOrder[] = []) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-orders?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load work orders')
      setWorkOrders(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { workOrders, loading, error, refresh }
}
