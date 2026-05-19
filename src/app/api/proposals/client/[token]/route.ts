import { createAdminClient } from '@/lib/supabase/admin'
import { convertAcceptedProposalToJob } from '@/lib/proposals/conversion'
import { NextResponse } from 'next/server'

// Public route - authenticated by estimates.public_token. No user session required.

type Params = { params: Promise<{ token: string }> }
type ProposalAction = 'approve' | 'reject'

const RESPONSE_SELECT = `
  id,
  title,
  status,
  public_token,
  client_approved_at,
  client_rejected_at,
  client_name,
  client_signature,
  client_response_note
`

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(
  _request: Request,
  { params }: Params
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('estimates')
    .select(`
      id,
      lead_id,
      job_name,
      job_type,
      markup_pct,
      status,
      scope_text,
      title,
      version,
      notes,
      public_token,
      client_approved_at,
      client_rejected_at,
      client_name,
      client_signature,
      client_response_note,
      created_at,
      updated_at,
      lead:lead_id (
        title,
        client_name,
        client_email,
        client_phone,
        address
      ),
      lines:estimate_lines (
        id,
        description,
        phase,
        uom,
        quantity,
        unit_cost,
        markup_pct,
        sort_order,
        notes,
        created_at
      )
    `)
    .eq('public_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: Params
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action as ProposalAction
  const clientName = cleanText(body.client_name)
  const clientSignature = cleanText(body.client_signature)
  const clientResponseNote = cleanText(body.client_response_note)

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject".' }, { status: 400 })
  }

  if (!clientName) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }

  if (action === 'approve' && !clientSignature) {
    return NextResponse.json({ error: 'Please enter your signature.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existing, error: fetchError } = await admin
    .from('estimates')
    .select('id, lead_id, status, public_token, client_approved_at, client_rejected_at')
    .eq('public_token', token)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  if (existing.status !== 'sent') {
    return NextResponse.json(
      { error: `Cannot ${action === 'approve' ? 'accept' : 'decline'} a proposal with status "${existing.status}".` },
      { status: 409 }
    )
  }

  if (existing.client_approved_at || existing.client_rejected_at) {
    return NextResponse.json({ error: 'This proposal already has a client response.' }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    if (!existing.lead_id) {
      return NextResponse.json({ error: 'Accepted proposal is not linked to a lead.' }, { status: 500 })
    }

    try {
      const conversion = await convertAcceptedProposalToJob({
        admin,
        leadId: existing.lead_id,
        estimateId: existing.id,
      })

      const { data, error } = await admin
        .from('estimates')
        .update({
          status: 'approved',
          client_approved_at: now,
          client_name: clientName,
          client_signature: clientSignature,
          client_response_note: clientResponseNote || null,
        })
        .eq('id', existing.id)
        .select(RESPONSE_SELECT)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ...data, conversion })
    } catch (conversionError) {
      return NextResponse.json(
        {
          error: conversionError instanceof Error
            ? conversionError.message
            : 'Proposal acceptance could not be converted into a job.',
        },
        { status: 500 },
      )
    }
  }

  const { data, error } = await admin
    .from('estimates')
    .update({
      status: 'rejected',
      client_rejected_at: now,
      client_name: clientName,
      client_signature: clientSignature || null,
      client_response_note: clientResponseNote || null,
    })
    .eq('id', existing.id)
    .select(RESPONSE_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
