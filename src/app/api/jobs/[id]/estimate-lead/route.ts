import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/estimate-lead
 *
 * Estimates hang off leads, but jobs imported from BuilderTrend have no lead,
 * which left their Estimates tab with nowhere to go. This gives such a job a
 * home for its estimate:
 *   1. Already linked to a lead → returns it, no writes.
 *   2. Otherwise creates a lead seeded from the job — marked won and pointing
 *      back at the job, since the work already exists — and links it via
 *      jobs.lead_id.
 *   3. Returns { lead_id } so the client can open the estimate builder.
 *
 * Requires: budget.can_create — the same gate POST /api/estimates uses, so a
 * caller is never left holding a fresh lead they can't build an estimate on.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_create) {
    return NextResponse.json(
      { error: 'You do not have permission to create estimates.' },
      { status: 403 },
    )
  }

  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .select('id, job_number, name, description, client_name, client_email, client_phone, site_address, contract_amount, lead_id')
    .eq('id', id)
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  // Already has somewhere to put estimates
  if (job.lead_id) {
    return NextResponse.json({ lead_id: job.lead_id, created: false })
  }

  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .insert({
      title:            job.name,
      client_name:      job.client_name,
      client_email:     job.client_email,
      client_phone:     job.client_phone,
      address:          job.site_address,
      notes:            job.description,
      estimated_value:  job.contract_amount,
      status:           'won',
      converted_job_id: job.id,
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (leadErr || !lead) {
    return NextResponse.json(
      { error: leadErr?.message ?? 'Failed to create a lead for this estimate.' },
      { status: 500 },
    )
  }

  // Only claim the job if it's still unlinked — two people hitting the button
  // at once must not leave a stray lead behind.
  const { data: linked, error: linkErr } = await admin
    .from('jobs')
    .update({ lead_id: lead.id })
    .eq('id', job.id)
    .is('lead_id', null)
    .select('lead_id')
    .maybeSingle()

  if (linkErr || !linked) {
    await admin.from('leads').delete().eq('id', lead.id)

    if (!linkErr) {
      // Someone linked one first — use theirs.
      const { data: current } = await admin
        .from('jobs')
        .select('lead_id')
        .eq('id', job.id)
        .single()
      if (current?.lead_id) {
        return NextResponse.json({ lead_id: current.lead_id, created: false })
      }
    }

    return NextResponse.json(
      { error: linkErr?.message ?? 'Failed to link the estimate to this job.' },
      { status: 500 },
    )
  }

  await admin
    .from('lead_activities')
    .insert({
      lead_id:    lead.id,
      note:       `Created from job ${job.job_number} to hold its estimate.`,
      created_by: user.id,
    })

  return NextResponse.json({ lead_id: lead.id, created: true }, { status: 201 })
}
