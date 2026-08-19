import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Bulk approve/reject for the time clock manager view — one round trip instead
// of N sequential PATCHes when a manager selects a week's worth of shifts.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  if (!perm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter(Boolean) : []
  const status = body.status === 'rejected' ? 'rejected' : 'approved'

  if (ids.length === 0) return NextResponse.json({ error: 'No entries selected' }, { status: 400 })

  const { data, error } = await admin
    .from('time_entries')
    .update({
      approval_status: status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}
