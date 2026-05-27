import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_view) {
    return NextResponse.json({ error: 'Forbidden — admin permission required' }, { status: 403 })
  }

  let body: { link_id: string; action: 'approve' | 'reject' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { link_id, action } = body
  if (!link_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'link_id and action (approve|reject) are required' }, { status: 400 })
  }

  const { data: link, error: linkErr } = await admin
    .from('job_external_links')
    .select('*')
    .eq('id', link_id)
    .eq('job_id', id)
    .single()

  if (linkErr || !link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  const newStatus = action === 'approve' ? 'linked' : 'rejected'

  const { error: updateErr } = await admin
    .from('job_external_links')
    .update({ status: newStatus, matched_by: 'admin' })
    .eq('id', link_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // When admin approves a SharePoint folder link, propagate to jobs summary fields
  if (action === 'approve' && link.provider === 'sharepoint' && link.link_type === 'folder') {
    const meta = (link.raw_metadata ?? {}) as Record<string, unknown>
    const driveId = (meta.parentReference as Record<string, unknown> | undefined)?.driveId as string | undefined

    await admin.from('jobs').update({
      sharepoint_folder_url:     link.external_url,
      sharepoint_folder_path:    link.external_path,
      sharepoint_drive_item_id:  driveId ? `${driveId}!${link.external_id}` : link.external_id,
      documents_sync_status:     'linked',
      documents_last_checked_at: new Date().toISOString(),
      documents_sync_error:      null,
    }).eq('id', id)
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
