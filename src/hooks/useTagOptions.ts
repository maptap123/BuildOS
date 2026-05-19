'use client'

import { useEffect, useState } from 'react'

export interface TagOption {
  id: number
  name: string
  sort_order: number
}

export function useTagOptions() {
  const [tags, setTags] = useState<TagOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/tags')
      .then(r => r.json())
      .then(data => setTags(Array.isArray(data) ? data : []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false))
  }, [])

  return { tags, loading }
}
