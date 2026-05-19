import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_STATUSES = ['lead', 'presale', 'active', 'warranty', 'closed', 'archived'] as const

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: job, error } = await admin
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  // Whitelist editable fields
  const allowed = [
    'name', 'description', 'status',
    'contract_amount', 'estimated_cost',
    'tags',
    'site_address', 'city', 'state', 'postal_code',
    'start_date', 'target_completion_date', 'actual_completion_date',
    'client_name', 'client_email', 'client_phone',
    'project_manager_id', 'superintendent_id',
    'warranty_start_date', 'warranty_end_date', 'closeout_checklist',
  ] as const

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if (update.status && !VALID_STATUSES.includes(update.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('jobs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.from('jobs').delete().eq('id', id)

  if (error) {
    // FK constraint — related records exist; suggest archiving instead
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Cannot delete: job has related records. Archive it instead.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
