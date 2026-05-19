'use client'

import { useEffect, useState } from 'react'

export interface UserOption {
  id: string
  full_name: string | null
  email: string
}

export function useUsers() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  return { users, loading }
}
