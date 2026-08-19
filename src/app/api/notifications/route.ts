import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET: the current user's recent notifications + unread count. No module permission
// gate — every authenticated user can see their own notifications.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unreadCount = (data ?? []).filter((n) => !n.read_at).length
  return NextResponse.json({ notifications: data ?? [], unreadCount })
}

// PATCH { id } marks one notification read; PATCH { all: true } marks every
// unread notification for the current user read.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const now = new Date().toISOString()
  const admin = createAdminClient()

  if (body.all) {
    const { error } = await admin
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', user.id)
      .is('read_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await admin
    .from('notifications')
    .update({ read_at: now })
    .eq('id', body.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
