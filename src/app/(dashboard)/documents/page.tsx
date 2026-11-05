import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DocumentsClient } from '@/components/documents'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; folder?: string }>
}) {
  const { job, folder } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('user_id', user.id)
    .eq('module', 'documents')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view documents.
      </div>
    )
  }

  const { data: documents } = await admin
    .from('documents')
    .select('*, jobs(name)')
    .order('created_at', { ascending: false })

  const { data: jobs } = await admin
    .from('jobs')
    .select('id, name, job_number')

  return (
    <DocumentsClient
      key={`${job ?? ''}|${folder ?? ''}`}
      initialDocuments={documents ?? []}
      jobs={jobs ?? []}
      jobId={job ?? null}
      folder={folder ?? null}
      permissions={{
        can_create: perm.can_create,
        can_edit:   perm.can_edit,
        can_delete: perm.can_delete,
      }}
    />
  )
}
