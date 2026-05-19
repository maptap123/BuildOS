import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JobStatusSelect } from '@/components/jobs'
import type { JobStatus } from '@/types'

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: job }, { data: perm }] = await Promise.all([
    admin.from('jobs').select('id, job_number, name, status').eq('id', id).single(),
    admin.from('user_permissions').select('can_edit').eq('user_id', user.id).eq('module', 'jobs').single(),
  ])

  if (!job) notFound()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {job.job_number}
          </p>
          <h2 className="font-display text-xl font-bold text-navy-900 truncate">
            {job.name}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <JobStatusSelect
            jobId={job.id}
            initialStatus={job.status as JobStatus}
            canEdit={perm?.can_edit ?? false}
          />
          {perm?.can_edit && (
            <Link
              href={`/jobs/${job.id}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} />
              Edit
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
