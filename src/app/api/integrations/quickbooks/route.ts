import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET  /api/integrations/quickbooks  — connection status
 * POST /api/integrations/quickbooks  — trigger sync for a specific job
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('integration_settings')
    .select('service, is_connected, realm_id, connected_at, last_sync_at, sync_error')
    .eq('service', 'quickbooks')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: budgetPerm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!budgetPerm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { job_id } = await request.json()
  if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: integration } = await admin
    .from('integration_settings')
    .select('is_connected, realm_id')
    .eq('service', 'quickbooks')
    .single()

  if (!integration?.is_connected) {
    return NextResponse.json({
      error: 'QuickBooks is not connected. Configure the QB integration in Settings → Integrations.',
      setup_required: true,
    }, { status: 422 })
  }

  // Mark job as pending sync
  await admin.from('jobs').update({ qb_sync_status: 'pending' }).eq('id', job_id)

  // TODO: When QB OAuth tokens are stored in integration_settings:
  //   1. Refresh access_token if expired
  //   2. Fetch job details
  //   3. Create/update QB Customer: POST /v3/company/{realmId}/customer
  //   4. Create/update QB Project:  POST /v3/company/{realmId}/project
  //   5. Sync approved actuals as QB Bills
  //   6. Update job row: qb_customer_id, qb_project_id, qb_sync_status='synced'
  //
  // Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer

  return NextResponse.json({
    message: 'QuickBooks sync queued',
    note: 'Full QB API integration will be completed when OAuth flow is configured.',
    job_id,
  })
}
