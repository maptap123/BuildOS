import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PermissionModule } from '@/types'

const MODULES: PermissionModule[] = [
  'jobs',
  'budget',
  'schedule',
  'tasks',
  'logs',
  'documents',
  'admin',
  'ai',
]

const FLAGS = [
  'can_view',
  'can_create',
  'can_edit',
  'can_delete',
  'can_export',
  'can_manage',
] as const

type PermissionFlag = typeof FLAGS[number]

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_manage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const permissionModule = body.module as PermissionModule
  const permissions = body.permissions as Partial<Record<PermissionFlag, unknown>>

  if (!userId || !MODULES.includes(permissionModule)) {
    return NextResponse.json({ error: 'Valid user_id and module are required' }, { status: 400 })
  }

  if (!permissions || typeof permissions !== 'object') {
    return NextResponse.json({ error: 'permissions object is required' }, { status: 400 })
  }

  const { data: targetUser } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updates: Record<PermissionFlag, boolean> = {
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_export: false,
    can_manage: false,
  }

  for (const flag of FLAGS) {
    updates[flag] = permissions[flag] === true
  }

  const { data, error } = await admin
    .from('user_permissions')
    .upsert(
      {
        user_id: userId,
        module: permissionModule,
        ...updates,
      },
      { onConflict: 'user_id,module' }
    )
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
