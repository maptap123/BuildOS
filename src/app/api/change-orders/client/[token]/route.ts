import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Public route — authenticated by client_token (UUID). No user session required.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('change_orders')
    .select(`
      co_number,
      title,
      description,
      status,
      type,
      amount,
      reason,
      submitted_date,
      approved_date,
      client_token,
      client_approved_at,
      client_rejected_at,
      client_name,
      job:job_id (
        name,
        client_name,
        site_address,
        city,
        state,
        postal_code
      )
    `)
    .eq('client_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Change order not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json()
  const { action } = body as { action: 'approve' | 'reject' }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject".' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch current CO to verify it's submitted
  const { data: existing, error: fetchError } = await admin
    .from('change_orders')
    .select('id, status')
    .eq('client_token', token)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Change order not found' }, { status: 404 })
  }

  if (existing.status !== 'submitted') {
    return NextResponse.json(
      { error: `Cannot ${action} a change order with status "${existing.status}"` },
      { status: 409 }
    )
  }

  const updates =
    action === 'approve'
      ? { status: 'approved', client_approved_at: new Date().toISOString(), approved_date: new Date().toISOString().split('T')[0] }
      : { client_rejected_at: new Date().toISOString() }

  const { data, error } = await admin
    .from('change_orders')
    .update(updates)
    .eq('id', existing.id)
    .select('co_number, title, status, client_approved_at, client_rejected_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
