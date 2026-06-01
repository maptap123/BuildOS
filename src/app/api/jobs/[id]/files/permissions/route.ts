import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Admin-only action
  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { sharepoint_item_id, visibility } = body ?? {}

  if (!sharepoint_item_id || !['admin_only', 'all'].includes(visibility)) {
    return NextResponse.json(
      { error: 'sharepoint_item_id and visibility ("admin_only" | "all") are required' },
      { status: 400 }
    )
  }

  const { data, error } = await admin
    .from('job_file_permissions')
    .upsert(
      {
        job_id:              id,
        sharepoint_item_id,
        visibility,
        updated_by:          user.id,
      },
      { onConflict: 'job_id,sharepoint_item_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
