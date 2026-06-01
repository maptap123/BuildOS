import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSharePointItemDownloadUrl } from '@/lib/integrations/microsoft/sharepointReadOnlyClient'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id: jobId, fileId } = await params
  const { searchParams } = new URL(req.url)
  const driveId = searchParams.get('driveId')

  if (!driveId) {
    return NextResponse.json({ error: 'driveId query param is required' }, { status: 400 })
  }

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

  // Non-admins may only download files explicitly shared with all users
  if (!isAdmin) {
    const { data: perm } = await admin
      .from('job_file_permissions')
      .select('visibility')
      .eq('job_id', jobId)
      .eq('sharepoint_item_id', fileId)
      .single()

    if (perm?.visibility !== 'all') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    const downloadUrl = await getSharePointItemDownloadUrl(driveId, fileId)
    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get download URL'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
