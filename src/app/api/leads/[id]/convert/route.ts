import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { convertAcceptedProposalToJob } from '@/lib/proposals/conversion'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

/** Conversion saves/reuses one job before the office project-setup step. QBO failure cannot recreate it. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const { data: perm } = await admin.from('user_permissions').select('can_create').eq('user_id', user.id).eq('module', 'jobs').single()
  if (!perm?.can_create) return NextResponse.json({ error: 'You do not have permission to create jobs.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const estimateId = typeof body.estimate_id === 'string' ? body.estimate_id : null
  if (estimateId) {
    try {
      const result = await convertAcceptedProposalToJob({ admin, leadId: id, estimateId, actorUserId: user.id })
      return NextResponse.json(result, { status: result.reused_existing_job ? 200 : 201 })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to convert proposal.' }, { status: 500 })
    }
  }
  const { data: lead, error: leadErr } = await admin.from('leads').select('*').eq('id', id).single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
  if (lead.converted_job_id) return NextResponse.json({ error: 'This lead has already been converted to a job.', job_id: lead.converted_job_id }, { status: 409 })
  const { data: job, error } = await admin.rpc('ensure_lead_conversion_job', { p_lead_id: id, p_actor: user.id, p_seed: { status: 'presale' } })
  if (error || !job) return NextResponse.json({ error: 'Could not save conversion. No separate job was created. Check the project-setup migration and retry.' }, { status: 500 })
  await admin.from('lead_activities').insert({ lead_id: id, note: `Converted to job ${job.job_number}.`, created_by: user.id })
  return NextResponse.json({ job }, { status: 201 })
}
