import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { TemplatesClient } from '@/components/templates/TemplatesClient'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  if (!(await hasModulePermOrAdmin(admin, user.id, 'jobs', 'can_view'))) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view templates.
      </div>
    )
  }
  const canEdit = await hasModulePermOrAdmin(admin, user.id, 'jobs', 'can_edit')
  return <TemplatesClient canEdit={canEdit} />
}
