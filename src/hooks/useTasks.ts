'use client'

import { useCallback, useState } from 'react'
import type { Task } from '@/types'

export function useTasks(jobId: string, initialTasks: Task[] = []) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks?job_id=${jobId}`)
      if (!res.ok) throw new Error('Failed to load tasks')
      setTasks(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  return { tasks, loading, error, refresh }
}
