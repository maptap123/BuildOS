'use client'

import { useState, useEffect, useCallback } from 'react'
import type { BillingMilestone } from '@/types'

export function useBillingMilestones(jobId: string) {
  const [milestones, setMilestones] = useState<BillingMilestone[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/billing-milestones?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load billing milestones')
      setMilestones(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { void refresh() }, [refresh])

  return { milestones, loading, error, refresh }
}
