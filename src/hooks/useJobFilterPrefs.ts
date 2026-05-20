'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/types'

export function useJobFilterPrefs() {
  const [defaultStatuses, setDefaultStatuses] = useState<JobStatus[]>([])
  const [defaultTags, setDefaultTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { setLoading(false); return }

      supabase
        .from('user_preferences')
        .select('jobs_filter')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: row }) => {
          if (row?.jobs_filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = row.jobs_filter as any
            // Support legacy single-status format { status: '...' }
            const statuses: JobStatus[] = f.statuses ?? (f.status ? [f.status as JobStatus] : [])
            setDefaultStatuses(statuses)
            setDefaultTags(f.tags ?? [])
          }
          setLoading(false)
        })
    })
  }, [])

  const saveDefault = useCallback(async (statuses: JobStatus[], tags: string[]) => {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    await supabase
      .from('user_preferences')
      .upsert(
        { user_id: data.user.id, jobs_filter: { statuses, tags } },
        { onConflict: 'user_id' }
      )

    setDefaultStatuses(statuses)
    setDefaultTags(tags)
  }, [])

  return { defaultStatuses, defaultTags, saveDefault, loading }
}
