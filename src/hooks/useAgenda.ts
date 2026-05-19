'use client'

import { useEffect, useState } from 'react'
import type { AgendaPayload } from '@/types'

const EMPTY: AgendaPayload = {
  past_due: [],
  due_today: [],
  this_week: [],
  team_activity: [],
  missing_perms: [],
}

export function useAgenda() {
  const [data, setData] = useState<AgendaPayload>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/agenda')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<AgendaPayload>
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Unknown'))
      .finally(() => setLoading(false))
  }, [])

  return { ...data, loading, error }
}
