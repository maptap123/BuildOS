import { useState, useEffect, useCallback } from 'react'
import type { ChangeOrder } from '@/types'

export function useChangeOrders(jobId: string, initial: ChangeOrder[] = []) {
  const [orders, setOrders] = useState<ChangeOrder[]>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/change-orders?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load change orders')
      setOrders(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial.length) void fetch_()
  }, [fetch_, initial.length])

  return { orders, loading, error, refresh: fetch_ }
}
