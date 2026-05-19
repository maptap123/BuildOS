import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { convertAcceptedProposalToJob } from '@/lib/proposals/conversion'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/leads/[id]/convert
 *
 * Converts a Won lead into a Job:
 *   1. Validates the lead exists and hasn't already been converted.
 *   2. Creates a new job seeded with data from the lead.
 *   3. Back-fills lead.converted_job_id so the lead shows it's been converted.
 *   4. Returns { job } so the client can redirect to /jobs/[job.id].
 *
 * Requires: jobs.can_create permission.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const estimateId = typeof body.estimate_id === 'string' ? body.estimate_id : null

  // Permission check — need jobs.can_create to create a job
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_create, can_edit')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()

  if (!perm?.can_create) {
    return NextResponse.json({ error: 'You do not have permission to create jobs.' }, { status: 403 })
  }

  if (estimateId) {
    try {
      const result = await convertAcceptedProposalToJob({
        admin,
        leadId: id,
        estimateId,
        actorUserId: user.id,
      })

      return NextResponse.json(result, { status: result.reused_existing_job ? 200 : 201 })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to convert proposal.' },
        { status: 500 },
      )
    }
  }

  // Fetch the lead
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
  }

  // Guard: already converted
  if (lead.converted_job_id) {
    return NextResponse.json(
      { error: 'This lead has already been converted to a job.', job_id: lead.converted_job_id },
      { status: 409 },
    )
  }

  // Auto-generate job_number
  const { count } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
  const next       = String((count ?? 0) + 1).padStart(3, '0')
  const jobNumber  = `JDC-${new Date().getFullYear()}-${next}`

  // Parse address into site_address (the rest can be blank — user can fill in later)
  const siteAddress = lead.address?.trim() || 'TBD'

  // Create the job
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      job_number:    jobNumber,
      name:          lead.title.trim(),
      description:   lead.notes?.trim()        || null,
      client_name:   lead.client_name?.trim()  || 'Unknown',
      client_email:  lead.client_email?.trim() || null,
      client_phone:  lead.client_phone?.trim() || null,
      site_address:  siteAddress,
      status:        'presale',
      contract_amount: lead.estimated_value    || null,
      tags:          [],
      lead_id:       lead.id,
      created_by:    user.id,
      qb_sync_status: 'not_synced',
      closeout_checklist: {},
    })
    .select()
    .single()

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? 'Failed to create job.' },
      { status: 500 },
    )
  }

  // Mark lead as converted
  const { error: updateErr } = await admin
    .from('leads')
    .update({ converted_job_id: job.id, status: 'won' })
    .eq('id', lead.id)

  if (updateErr) {
    // Job was created — don't rollback, but warn
    console.error('[convert lead] Failed to mark lead converted:', updateErr.message)
  }

  // Log an activity entry on the lead
  await admin
    .from('lead_activities')
    .insert({
      lead_id:    lead.id,
      note:       `Converted to job ${jobNumber}.`,
      created_by: user.id,
    })

  return NextResponse.json({ job }, { status: 201 })
}
