import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// GET /api/schedule/[id]/predecessors
// Returns all predecessors for a schedule item, with the predecessor item's title joined
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'schedule')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('schedule_item_predecessors')
    .select('*, predecessor:schedule_items!predecessor_id(id, title)')
    .eq('item_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT /api/schedule/[id]/predecessors
// Replaces all predecessors for a schedule item atomically.
// Body: [{ predecessor_id, type, lag_days }]
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'schedule')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body: { predecessor_id: string; type: string; lag_days: number }[] = await request.json()

  const admin = createAdminClient()

  // Get the item's job_id
  const { data: schedItem } = await admin
    .from('schedule_items')
    .select('job_id')
    .eq('id', id)
    .single()

  if (!schedItem) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })

  // Atomic replace: delete existing, insert new
  const { error: delErr } = await admin
    .from('schedule_item_predecessors')
    .delete()
    .eq('item_id', id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (body.length > 0) {
    const rows = body
      .filter(p => p.predecessor_id && p.predecessor_id !== id) // guard against self-ref
      .map(p => ({
        job_id: schedItem.job_id,
        item_id: id,
        predecessor_id: p.predecessor_id,
        type: ['FS', 'SS', 'FF', 'SF'].includes(p.type) ? p.type : 'FS',
        lag_days: Number(p.lag_days) || 0,
        created_by: user.id,
      }))

    if (rows.length > 0) {
      const { error: insErr } = await admin
        .from('schedule_item_predecessors')
        .insert(rows)

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
