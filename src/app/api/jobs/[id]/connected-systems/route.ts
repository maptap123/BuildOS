import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: job, error: jobErr }, { data: links }] = await Promise.all([
    admin
      .from('jobs')
      .select('id, name, job_number, client_name, sharepoint_folder_url, sharepoint_folder_path, sharepoint_drive_item_id, documents_sync_status, documents_last_checked_at, documents_sync_error')
      .eq('id', id)
      .single(),
    admin
      .from('job_external_links')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (jobErr || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    job: {
      id:                       job.id,
      name:                     job.name,
      job_number:               job.job_number,
      client_name:              job.client_name,
      sharepoint_folder_url:    job.sharepoint_folder_url,
      sharepoint_folder_path:   job.sharepoint_folder_path,
      sharepoint_drive_item_id: job.sharepoint_drive_item_id,
      documents_sync_status:    job.documents_sync_status ?? 'not_linked',
      documents_last_checked_at: job.documents_last_checked_at,
      documents_sync_error:     job.documents_sync_error,
    },
    links: links ?? [],
  })
}
