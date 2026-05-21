import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

interface ConvertProposalOptions {
  admin: AdminClient
  leadId: string
  estimateId?: string | null
  actorUserId?: string | null
}

interface EstimateLineRow {
  id: string
  estimate_id: string
  lead_id: string
  description: string
  phase: string | null
  cost_code: string | null
  quantity: number
  unit_cost: number
  markup_pct: number
  notes: string | null
  sort_order: number
}

function lineTotal(line: EstimateLineRow) {
  return Number(line.quantity || 0) * Number(line.unit_cost || 0) * (1 + Number(line.markup_pct || 0) / 100)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function categoryForLine(line: EstimateLineRow) {
  if (line.phase?.trim()) return line.phase.trim()
  if (line.cost_code?.trim()) return `Cost Code ${line.cost_code.trim()}`
  return 'Estimate'
}

async function generateJobNumber(admin: AdminClient) {
  const { count } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })

  const next = String((count ?? 0) + 1).padStart(3, '0')
  return `JDC-${new Date().getFullYear()}-${next}`
}

export async function convertAcceptedProposalToJob({
  admin,
  leadId,
  estimateId,
  actorUserId,
}: ConvertProposalOptions) {
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    throw new Error('Lead not found.')
  }

  let estimateQuery = admin
    .from('estimates')
    .select('*')
    .eq('lead_id', leadId)

  if (estimateId) {
    estimateQuery = estimateQuery.eq('id', estimateId)
  } else {
    estimateQuery = estimateQuery
      .in('status', ['approved', 'sent'])
      .order('status', { ascending: true })
      .order('version', { ascending: false })
      .limit(1)
  }

  const { data: estimateRows, error: estimateErr } = await estimateQuery

  if (estimateErr) {
    throw new Error(estimateErr.message)
  }

  const estimate = Array.isArray(estimateRows) ? estimateRows[0] : estimateRows
  if (!estimate) {
    throw new Error('No estimate found to convert.')
  }

  const { data: lines, error: linesErr } = await admin
    .from('estimate_lines')
    .select('*')
    .eq('estimate_id', estimate.id)
    .order('sort_order')
    .order('created_at')

  if (linesErr) {
    throw new Error(linesErr.message)
  }

  const estimateLines = (lines ?? []) as EstimateLineRow[]
  if (estimateLines.length === 0) {
    throw new Error('This estimate has no line items to convert.')
  }

  const createdBy = actorUserId ?? estimate.created_by ?? lead.created_by
  const total = estimateLines.reduce((sum, line) => sum + lineTotal(line), 0)

  let job = null
  if (lead.converted_job_id) {
    const { data: existingJob, error: existingJobErr } = await admin
      .from('jobs')
      .select('*')
      .eq('id', lead.converted_job_id)
      .single()

    if (existingJobErr || !existingJob) {
      throw new Error('Lead is marked converted, but the linked job could not be found.')
    }

    job = existingJob
  } else {
    const jobNumber = await generateJobNumber(admin)
    const { data: createdJob, error: jobErr } = await admin
      .from('jobs')
      .insert({
        job_number: jobNumber,
        name: estimate.job_name?.trim() || lead.title.trim(),
        description: estimate.scope_text?.trim() || lead.notes?.trim() || null,
        client_name: lead.client_name?.trim() || 'Unknown',
        client_email: lead.client_email?.trim() || null,
        client_phone: lead.client_phone?.trim() || null,
        site_address: lead.address?.trim() || 'TBD',
        status: 'active',
        contract_amount: total,
        estimated_cost: estimateLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0),
        tags: [],
        lead_id: lead.id,
        created_by: createdBy,
        qb_sync_status: 'not_synced',
        closeout_checklist: {},
      })
      .select()
      .single()

    if (jobErr || !createdJob) {
      throw new Error(jobErr?.message ?? 'Failed to create job.')
    }

    job = createdJob

    await admin
      .from('leads')
      .update({ converted_job_id: job.id, status: 'won' })
      .eq('id', lead.id)
  }

  const conversionNote = `Converted from estimate ${estimate.id}`

  const { count: existingBudgetCount } = await admin
    .from('budget_lines')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .ilike('notes', `%${estimate.id}%`)

  let budgetLinesCreated = 0
  if ((existingBudgetCount ?? 0) === 0) {
    const budgetRows = estimateLines.map(line => {
      const amount = lineTotal(line)
      return {
        job_id: job.id,
        cost_code: line.cost_code?.trim() || 'EST',
        category: categoryForLine(line),
        description: line.description.trim(),
        status: 'approved',
        phase: line.phase?.trim() || null,
        original_budget: amount,
        revised_budget: amount,
        committed_cost: 0,
        forecast_cost: amount,
        notes: [conversionNote, line.notes].filter(Boolean).join('\n'),
        created_by: createdBy,
      }
    })

    const { error: budgetErr } = await admin.from('budget_lines').insert(budgetRows)
    if (budgetErr) {
      throw new Error(budgetErr.message)
    }
    budgetLinesCreated = budgetRows.length
  }

  const { count: existingScheduleCount } = await admin
    .from('schedule_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .ilike('description', `%${estimate.id}%`)

  let scheduleItemsCreated = 0
  if ((existingScheduleCount ?? 0) === 0) {
    const phases = Array.from(new Set(estimateLines.map(line => categoryForLine(line))))
    const start = addDays(new Date(), 1)
    const scheduleRows = phases.map((phase, index) => ({
      job_id: job.id,
      title: phase,
      description: `Starter milestone generated from accepted proposal estimate ${estimate.id}.`,
      status: 'not_started',
      start_date: toDateString(addDays(start, index * 7)),
      end_date: toDateString(addDays(start, index * 7 + 5)),
      all_day: true,
      assigned_user_id: null,
      predecessor_id: null,
      sort_order: index,
      percent_complete: 0,
      trade: phase,
      color: null,
      created_by: createdBy,
    }))

    const { error: scheduleErr } = await admin.from('schedule_items').insert(scheduleRows)
    if (scheduleErr) {
      throw new Error(scheduleErr.message)
    }
    scheduleItemsCreated = scheduleRows.length
  }

  await admin
    .from('estimates')
    .update({ status: 'approved', job_id: job.id })
    .eq('id', estimate.id)

  await admin
    .from('lead_activities')
    .insert({
      lead_id: lead.id,
      note: `Accepted proposal converted to job ${job.job_number}. Added ${budgetLinesCreated} budget line(s) and ${scheduleItemsCreated} schedule milestone(s).`,
      created_by: createdBy,
    })

  return {
    job,
    estimate,
    budget_lines_created: budgetLinesCreated,
    schedule_items_created: scheduleItemsCreated,
    reused_existing_job: Boolean(lead.converted_job_id),
  }
}
