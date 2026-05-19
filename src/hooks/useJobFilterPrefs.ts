'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/types'

interface JobFilterPrefs {
  status: JobStatus | ''
  tags: string[]
}

export function useJobFilterPrefs() {
  const [defaultStatus, setDefaultStatus] = useState<JobStatus | ''>('')
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
            const f = row.jobs_filter as JobFilterPrefs
            setDefaultStatus(f.status ?? '')
            setDefaultTags(f.tags ?? [])
          }
          setLoading(false)
        })
    })
  }, [])

  const saveDefault = useCallback(async (status: JobStatus | '', tags: string[]) => {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    await supabase
      .from('user_preferences')
      .upsert(
        { user_id: data.user.id, jobs_filter: { status, tags } },
        { onConflict: 'user_id' }
      )

    setDefaultStatus(status)
    setDefaultTags(tags)
  }, [])

  return { defaultStatus, defaultTags, saveDefault, loading }
}
