import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: permission, error: permissionError } = await admin
      .from('user_permissions')
      .select('can_view')
      .eq('user_id', user.id)
      .eq('module', 'documents')
      .maybeSingle()

    if (permissionError) return NextResponse.json({ error: 'Unable to verify document access' }, { status: 500 })
    if (!permission?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Uploaded documents use documents.can_view, matching the Documents pages.
    // job_file_permissions applies separately to SharePoint items, not these rows.
    const { id } = await params
    const { data: document, error: documentError } = await admin
      .from('documents')
      .select('file_path, storage_bucket')
      .eq('id', id)
      .maybeSingle()

    if (documentError) return NextResponse.json({ error: 'Unable to load document' }, { status: 500 })
    if (!document?.file_path || !document.storage_bucket) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { data, error } = await admin.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.file_path, 60)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Unable to open document' }, { status: 500 })
    }

    const response = NextResponse.redirect(data.signedUrl)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Unable to open document' }, { status: 500 })
  }
}
