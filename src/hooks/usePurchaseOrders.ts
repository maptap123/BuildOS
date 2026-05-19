'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PurchaseOrder } from '@/types'

export function usePurchaseOrders(jobId: string, initial: PurchaseOrder[] = []) {
  const [pos, setPos] = useState<PurchaseOrder[]>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/purchase-orders?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load purchase orders')
      setPos(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    if (!initial.length) void refresh()
  }, [refresh, initial.length])

  return { pos, loading, error, refresh }
}
