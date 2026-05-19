'use client'

import { useCallback, useState } from 'react'
import type { BudgetLine, Actual } from '@/types'

export function useBudget(
  jobId: string,
  initialLines: BudgetLine[] = [],
  initialActuals: Actual[] = []
) {
  const [lines, setLines] = useState<BudgetLine[]>(initialLines)
  const [actuals, setActuals] = useState<Actual[]>(initialActuals)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [linesRes, actualsRes] = await Promise.all([
        fetch(`/api/budget?job_id=${jobId}`),
        fetch(`/api/actuals?job_id=${jobId}`),
      ])
      if (!linesRes.ok || !actualsRes.ok) throw new Error('Failed to load budget data')
      const [linesData, actualsData] = await Promise.all([linesRes.json(), actualsRes.json()])
      setLines(linesData)
      setActuals(actualsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  return { lines, actuals, loading, error, refresh }
}
