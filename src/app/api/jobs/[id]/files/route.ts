import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listSharePointFolderContents } from '@/lib/integrations/microsoft/sharepointReadOnlyClient'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const [{ data: jobPerm }, { data: adminPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'jobs').single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'admin').single(),
  ])

  if (!jobPerm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = !!(adminPerm?.can_view)

  const { data: job } = await admin
    .from('jobs')
    .select('id, sharepoint_drive_item_id, documents_sync_status')
    .eq('id', id)
    .single()

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!job.sharepoint_drive_item_id || job.documents_sync_status !== 'linked') {
    return NextResponse.json({ linked: false, files: [] })
  }

  let spItems
  try {
    spItems = await listSharePointFolderContents(job.sharepoint_drive_item_id)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'SharePoint fetch failed' },
      { status: 502 }
    )
  }

  // Load all permission records for this job in one query
  const { data: permRecords } = await admin
    .from('job_file_permissions')
    .select('sharepoint_item_id, visibility')
    .eq('job_id', id)

  const permMap = new Map<string, string>()
  for (const p of permRecords ?? []) {
    permMap.set(p.sharepoint_item_id, p.visibility)
  }

  const files = spItems
    .map(item => ({
      id:           item.id,
      name:         item.name,
      webUrl:       item.webUrl,
      size:         item.size ?? null,
      mimeType:     item.file?.mimeType ?? null,
      isFolder:     !!item.folder,
      lastModified: item.lastModifiedDateTime ?? null,
      // default to admin_only if no record exists
      visibility:   (permMap.get(item.id) ?? 'admin_only') as 'admin_only' | 'all',
    }))
    // Non-admins only see files explicitly set to 'all'
    .filter(f => isAdmin || f.visibility === 'all')

  return NextResponse.json({ linked: true, files, isAdmin })
}
