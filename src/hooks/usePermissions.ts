'use client'

import { useEffect, useState } from 'react'
import type { PermissionModule, UserPermission } from '@/types'

type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'manage'
type PermissionMap = Partial<Record<PermissionModule, UserPermission>>

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/me/permissions')
        if (!res.ok) { setLoading(false); return }
        const data: UserPermission[] = await res.json()
        const map: PermissionMap = {}
        data.forEach(p => { map[p.module as PermissionModule] = p })
        setPermissions(map)
      } catch {
        // network error — leave permissions empty
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function can(module: PermissionModule, action: PermissionAction): boolean {
    const key = `can_${action}` as keyof UserPermission
    return permissions[module]?.[key] === true
  }

  function isAdmin(): boolean {
    return can('admin', 'manage')
  }

  return { permissions, loading, can, isAdmin }
}
