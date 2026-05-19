'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PermissionModule, UserPermission } from '@/types'

type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'manage'
type PermissionMap = Partial<Record<PermissionModule, UserPermission>>

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id)

      if (data) {
        const map: PermissionMap = {}
        data.forEach(p => { map[p.module as PermissionModule] = p })
        setPermissions(map)
      }
      setLoading(false)
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
