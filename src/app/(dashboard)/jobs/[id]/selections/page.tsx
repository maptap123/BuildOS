import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { loadSelectionsBoard } from '@/lib/selections/board'
import { SelectionsClient } from '@/components/selections'

export default async function JobSelectionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Selections rides the Budget permission (allowances + overage change orders are money).
  const [canView, canCreate, canEdit, canDelete, { data: job }] = await Promise.all([
    hasModulePermOrAdmin(admin, user.id, 'budget', 'can_view'),
    hasModulePermOrAdmin(admin, user.id, 'budget', 'can_create'),
    hasModulePermOrAdmin(admin, user.id, 'budget', 'can_edit'),
    hasModulePermOrAdmin(admin, user.id, 'budget', 'can_delete'),
    admin.from('jobs').select('id').eq('id', id).single(),
  ])

  if (!canView) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view selections.
      </div>
    )
  }
  if (!job) notFound()

  const board = await loadSelectionsBoard(admin, id, user.id)

  return (
    <SelectionsClient
      jobId={id}
      initialBoard={board}
      permissions={{ can_create: canCreate, can_edit: canEdit, can_delete: canDelete }}
    />
  )
}
