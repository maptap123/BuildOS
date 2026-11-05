import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JobFilesPanel } from '@/components/jobs/JobFilesPanel'
import { DocumentsClient } from '@/components/documents'

export default async function JobDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ folder?: string }>
}) {
  const { id } = await params
  const { folder } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view job documents.
      </div>
    )
  }

  const { data: docPerm } = await admin
    .from('user_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('user_id', user.id)
    .eq('module', 'documents')
    .single()

  const { data: documents } = docPerm?.can_view
    ? await admin.from('documents').select('*, jobs(name)').eq('job_id', id).order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="space-y-8">
      {docPerm?.can_view && (
        <DocumentsClient
          key={folder ?? ''}
          scoped
          jobId={id}
          folder={folder ?? null}
          basePath={`/jobs/${id}/documents`}
          initialDocuments={documents ?? []}
          permissions={{
            can_create: !!docPerm.can_create,
            can_edit:   !!docPerm.can_edit,
            can_delete: !!docPerm.can_delete,
          }}
        />
      )}
      <div>
        <h2 className="font-display text-base font-semibold text-navy-900 mb-3">OneDrive</h2>
        <JobFilesPanel jobId={id} fullPage />
      </div>
    </div>
  )
}
