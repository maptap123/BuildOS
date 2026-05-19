import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')?.trim()
  const tags = searchParams.getAll('tag').map(t => t.trim()).filter(Boolean)
  const managerId = searchParams.get('manager_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: jobPerm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!jobPerm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: budgetPerm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  const canSeeBudget = budgetPerm?.can_view ?? false

  let query = admin.from('jobs').select('*').order('created_at', { ascending: false })
  if (status) {
    query = query.eq('status', status)
  } else {
    // Exclude archived jobs from the default list
    query = query.neq('status', 'archived')
  }
  if (tags.length > 0) query = query.overlaps('tags', tags)
  if (managerId) query = query.eq('project_manager_id', managerId)
  if (search) {
    const escaped = search.replace(/[%_,]/g, '\\$&')
    query = query.or(
      `name.ilike.%${escaped}%,client_name.ilike.%${escaped}%,job_number.ilike.%${escaped}%,site_address.ilike.%${escaped}%,city.ilike.%${escaped}`
    )
  }

  const { data: jobs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (jobs ?? []).map(job => {
    if (canSeeBudget) return job
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { contract_amount: _ca, estimated_cost: _ec, ...rest } = job
    return rest
  })

  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const [{ data: perm }, { data: adminPerm }] = await Promise.all([
    admin
      .from('user_permissions')
      .select('can_create')
      .eq('user_id', user.id)
      .eq('module', 'jobs')
      .single(),
    admin
      .from('user_permissions')
      .select('can_manage')
      .eq('user_id', user.id)
      .eq('module', 'admin')
      .single(),
  ])

  if (!perm?.can_create && !adminPerm?.can_manage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : []

  // Auto-generate job_number if not provided
  let jobNumber = body.job_number?.trim() || null
  if (!jobNumber) {
    const { count } = await admin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
    const next = String((count ?? 0) + 1).padStart(3, '0')
    jobNumber = `JDC-${new Date().getFullYear()}-${next}`
  }

  const { data: job, error } = await admin
    .from('jobs')
    .insert({ ...body, job_number: jobNumber, tags, created_by: user.id, qb_sync_status: 'not_synced' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trigger QB sync in the background (non-blocking).
  // When QB integration is configured, this will create a QB Customer + Project.
  triggerQBSync(job.id, admin).catch(() => { /* silent — sync status tracked on job row */ })

  return NextResponse.json(job, { status: 201 })
}

async function triggerQBSync(
  jobId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  // Check if QuickBooks is configured
  const { data: integration } = await admin
    .from('integration_settings')
    .select('is_connected, realm_id')
    .eq('service', 'quickbooks')
    .single()

  if (!integration?.is_connected) {
    // QB not connected yet — mark as not_synced (default), no-op
    return
  }

  // Mark as pending
  await admin
    .from('jobs')
    .update({ qb_sync_status: 'pending' })
    .eq('id', jobId)

  // TODO: Implement QB OAuth flow + API calls when QB connection is established.
  // Expected operations:
  //   1. POST /v3/company/{realmId}/customer  → creates QB Customer, store qb_customer_id
  //   2. POST /v3/company/{realmId}/project   → creates QB Project linked to customer, store qb_project_id
  //   3. Update job row: qb_sync_status='synced', qb_last_synced_at=now()
  //
  // On error: update qb_sync_status='error', qb_sync_error=message

  // Placeholder: mark error until real QB API is wired up
  await admin
    .from('jobs')
    .update({ qb_sync_status: 'error', qb_sync_error: 'QB API not yet configured' })
    .eq('id', jobId)
}
