'use client'

import { useEffect, useState } from 'react'
import type { Job } from '@/types'

type JobSummary = Pick<Job, 'id' | 'job_number' | 'name' | 'status'>

export function useJob(id: string | null) {
  const [job, setJob] = useState<JobSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!id) { setJob(null); return }
    setLoading(true)
    fetch(`/api/jobs/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setJob(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  return { job, loading }
}
