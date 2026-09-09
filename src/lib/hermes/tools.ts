import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notify, getJobNotifyTargets } from '@/lib/notifications'
import { findLinePricing } from '@/lib/estimates/linePricing'
import { buildAiEstimateLines } from '@/lib/estimates/aiLines'

// ─── Tool schemas for Claude ──────────────────────────────────────────────────

export const HERMES_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_jobs',
    description: 'List construction jobs. Optionally filter by status or search by name, client, or job number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['lead','estimating','scheduled','active','on_hold','completed','closed'], description: 'Filter by job status' },
        search: { type: 'string', description: 'Search by job name, client name, or job number' },
        limit: { type: 'number', description: 'Maximum jobs to return, default 50, max 500' },
        offset: { type: 'number', description: 'Number of jobs to skip for pagination' },
        page: { type: 'number', description: '1-based page number; ignored when offset is provided' },
      },
    },
  },
  {
    name: 'get_job',
    description: 'Get full details for a specific job by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'The job UUID' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Update the status of a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        status: { type: 'string', enum: ['lead','estimating','scheduled','active','on_hold','completed','closed'] },
      },
      required: ['job_id', 'status'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks for a job. Filter by status or priority.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id:   { type: 'string' },
        status:   { type: 'string', enum: ['todo','in_progress','done','blocked'] },
        priority: { type: 'string', enum: ['low','medium','high','urgent'] },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task on a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id:      { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        priority:    { type: 'string', enum: ['low','medium','high','urgent'] },
        due_date:    { type: 'string', description: 'ISO date string YYYY-MM-DD' },
      },
      required: ['job_id', 'title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id:     { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        status:      { type: 'string', enum: ['todo','in_progress','done','blocked'] },
        priority:    { type: 'string', enum: ['low','medium','high','urgent'] },
        due_date:    { type: 'string' },
        assigned_to: { type: 'string', description: 'User UUID to assign to' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_schedule',
    description: 'List schedule items (phases/milestones) for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        status: { type: 'string', enum: ['not_started','in_progress','completed','delayed'] },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'update_schedule_item',
    description: 'Update a schedule item — dates, status, percent complete, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_id:          { type: 'string' },
        title:            { type: 'string' },
        status:           { type: 'string', enum: ['not_started','in_progress','completed','delayed'] },
        start_date:       { type: 'string' },
        end_date:         { type: 'string' },
        percent_complete: { type: 'number', minimum: 0, maximum: 100 },
        trade:            { type: 'string' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'list_budget',
    description: 'List budget line items for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'get_budget_summary',
    description: 'Get a financial summary for a job: total budget, committed, forecast, actuals, variance, and approved change orders.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_change_orders',
    description: 'List change orders for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        status: { type: 'string', enum: ['draft','submitted','approved','rejected'] },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_change_order',
    description: 'Create a new change order on a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        title:  { type: 'string' },
        type:   { type: 'string', enum: ['additive','deductive','neutral'] },
        amount: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['job_id', 'title', 'type', 'amount'],
    },
  },
  {
    name: 'list_actuals',
    description: 'List actual costs/invoices for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id:         { type: 'string' },
        budget_line_id: { type: 'string', description: 'Narrow to a specific budget line' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_daily_logs',
    description: 'List daily logs for a job, most recent first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        limit:  { type: 'number', description: 'Max logs to return (default 10, max 50)' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_daily_log',
    description: 'Create a daily log entry for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id:           { type: 'string' },
        work_performed:   { type: 'string' },
        log_date:         { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        weather_summary:  { type: 'string' },
        manpower_count:   { type: 'number' },
        delays:           { type: 'string' },
        safety_notes:     { type: 'string' },
        inspection_notes: { type: 'string' },
      },
      required: ['job_id', 'work_performed'],
    },
  },
  {
    name: 'find_comparable_estimates',
    description: 'Find past JDC estimates that resemble a described scope of work, and return their actual line items. This is the pricing basis for building a new estimate — reuse these cost codes, descriptions and unit costs rather than guessing market rates. Call this first whenever asked to build, draft or price an estimate, then write the result with add_estimate_lines.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scope: { type: 'string', description: 'The work to price, in plain words. E.g. "full hall bath remodel — demo, tile shower, new vanity, tile floor, paint"' },
        limit: { type: 'number', description: 'How many comparable jobs to return (default 3, max 5). Each carries its full line items, so keep this small.' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'find_line_pricing',
    description: "Look up how JDC has actually priced one specific item across every past estimate, newest first. Use this when find_comparable_estimates did not surface a line you need — comparables match whole jobs, so a specialty item (glass shower enclosure, heated floor, a particular fixture) is often priced on a job that is otherwise nothing like this one. Prefer a real price from here over inventing a market rate.",
    input_schema: {
      type: 'object' as const,
      properties: {
        item:  { type: 'string', description: 'The item to price, in the words the estimate would use. E.g. "glass shower enclosure", "shower hinge door", "bath fan".' },
        limit: { type: 'number', description: 'Max lines to return (default 15, max 40).' },
      },
      required: ['item'],
    },
  },
  {
    name: 'add_estimate_lines',
    description: 'Append line items to an existing estimate. Use after find_comparable_estimates or find_line_pricing. Every line must cite where its name came from: pass line_id from those tools, or a cost_code from the cost book. The description is copied from that row — anything you type is discarded, so do not reword a line name. JDC reuses a fixed vocabulary of about 700 line names and a paraphrase reads as a different, unknown item. A line you cannot cite is held back blank for the estimator to name; it is refused outright outside the Estimate Builder. Lines are appended, never replacing what is there. When the estimator has the builder open these are staged for approval rather than added — the response says which happened, so report it as it comes back rather than assuming the lines landed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        estimate_id: { type: 'string' },
        lines: {
          type: 'array',
          description: 'The line items to add, in the order they should appear.',
          items: {
            type: 'object' as const,
            properties: {
              line_id:     { type: 'string', description: 'The id of the past line this came from, exactly as returned by find_comparable_estimates or find_line_pricing. This is what names the line — always send it when you have it.' },
              description: { type: 'string', description: 'Ignored when line_id or cost_code resolves; the stored name is used instead. Only send it for a line you cannot cite, as a suggestion for the estimator.' },
              phase:       { type: 'string', description: 'e.g. Demo, Plumbing, Tile, Painting' },
              cost_code:   { type: 'string', description: "JDC's own code, e.g. \"14.1320.010\". Names the line from the cost book when you have no line_id. Omit when you have neither." },
              uom:         { type: 'string', description: 'EA, SF, LF, HR, LS, … (default EA)' },
              quantity:    { type: 'number' },
              labor_cost:  { type: 'number', description: 'Per-unit labor. Send the split the source line gave you; unit_cost is computed from these three and cannot be set directly.' },
              material_cost: { type: 'number', description: 'Per-unit material.' },
              sub_cost:    { type: 'number', description: 'Per-unit subcontract.' },
              markup_pct:  { type: 'number' },
              rationale:   { type: 'string', description: 'One sentence: which job it came from and how you reasoned the quantity, or why nothing covered it.' },
            },
            required: ['description'],
          },
        },
      },
      required: ['estimate_id', 'lines'],
    },
  },
  {
    name: 'search_across_jobs',
    description: 'Search for something across all jobs, tasks, and schedule items.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:   { type: 'string', description: 'Search terms' },
        modules: { type: 'array', items: { type: 'string', enum: ['jobs','tasks','schedule'] }, description: 'Which modules to search (default: all)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'navigate_to',
    description: 'Navigate the user to a specific page in the JDC app. Use this when the user says "show me", "take me to", "go to", or "open" a section. First look up the job ID if needed, then call this. Valid routes: /jobs, /jobs/{job_id}, /jobs/{job_id}/budget, /jobs/{job_id}/schedule, /jobs/{job_id}/tasks, /jobs/{job_id}/logs, /jobs/{job_id}/estimates, /finance, /leads, /time-clock',
    input_schema: {
      type: 'object' as const,
      properties: {
        url:    { type: 'string', description: 'The app route to navigate to.' },
        label:  { type: 'string', description: 'Short description of the destination shown to the user, e.g. "daily logs for Ryan Porch"' },
      },
      required: ['url'],
    },
  },
]

// ─── Permission helper ────────────────────────────────────────────────────────

async function hasPerm(
  admin: SupabaseClient,
  userId: string,
  module: string,
  flag: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
): Promise<boolean> {
  const { data } = await admin
    .from('user_permissions')
    .select(flag)
    .eq('user_id', userId)
    .eq('module', module)
    .single()
  return (data as Record<string, boolean> | null)?.[flag] ?? false
}

function trim(v: unknown): string | null {
  if (typeof v !== 'string') return (v as string | null) ?? null
  const s = v.trim()
  return s || null
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  userId: string,
  admin: SupabaseClient
): Promise<unknown> {
  switch (toolName) {

    case 'list_jobs': {
      if (!await hasPerm(admin, userId, 'jobs', 'can_view')) return { error: 'Permission denied' }
      const rawLimit = Number(params.limit ?? 50)
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 50
      const rawOffset = params.offset !== undefined
        ? Number(params.offset)
        : params.page !== undefined
          ? (Number(params.page) - 1) * limit
          : 0
      const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0

      const canSeeBudget = await hasPerm(admin, userId, 'budget', 'can_view')
      let q = admin
        .from('jobs')
        .select(
          `id, job_number, name, status, client_name, site_address, start_date, target_completion_date${canSeeBudget ? ', contract_amount' : ''}`,
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
      if (params.status) q = q.eq('status', params.status)
      if (params.search) q = q.or(`name.ilike.%${params.search}%,client_name.ilike.%${params.search}%,job_number.ilike.%${params.search}%`)
      const { data, error, count } = await q.range(offset, offset + limit - 1)
      if (error) throw error
      return {
        jobs: data,
        count: data?.length ?? 0,
        total_count: count ?? data?.length ?? 0,
        limit,
        offset,
        has_more: count === null ? false : offset + (data?.length ?? 0) < count,
      }
    }

    case 'get_job': {
      if (!await hasPerm(admin, userId, 'jobs', 'can_view')) return { error: 'Permission denied' }
      const { data, error } = await admin.from('jobs').select('*, pm:project_manager_id(full_name), super:superintendent_id(full_name)').eq('id', params.job_id).single()
      if (error || !data) return { error: 'Job not found' }
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) {
        const { contract_amount: _ca, estimated_cost: _ec, ...rest } = data
        void _ca; void _ec
        return rest
      }
      return data
    }

    case 'update_job_status': {
      if (!await hasPerm(admin, userId, 'jobs', 'can_edit')) return { error: 'Permission denied' }
      const valid = ['lead','estimating','scheduled','active','on_hold','completed','closed']
      if (!valid.includes(params.status as string)) return { error: `Invalid status. Valid: ${valid.join(', ')}` }
      const { data, error } = await admin.from('jobs').update({ status: params.status }).eq('id', params.job_id).select().single()
      if (error) throw error
      return { job: data, message: `Status updated to ${params.status}` }
    }

    case 'list_tasks': {
      if (!await hasPerm(admin, userId, 'tasks', 'can_view')) return { error: 'Permission denied' }
      let q = admin.from('tasks').select('*').eq('job_id', params.job_id).order('priority', { ascending: false }).order('due_date', { nullsFirst: false })
      if (params.status)   q = q.eq('status', params.status)
      if (params.priority) q = q.eq('priority', params.priority)
      const { data, error } = await q
      if (error) throw error
      return { tasks: data, count: data?.length ?? 0 }
    }

    case 'create_task': {
      if (!await hasPerm(admin, userId, 'tasks', 'can_create')) return { error: 'Permission denied' }
      const { data, error } = await admin.from('tasks').insert({
        job_id: params.job_id, title: String(params.title).trim(),
        description: trim(params.description), priority: params.priority ?? 'medium',
        due_date: params.due_date ?? null, status: 'todo', created_by: userId,
      }).select().single()
      if (error) throw error
      return { task: data, message: 'Task created' }
    }

    case 'update_task': {
      if (!await hasPerm(admin, userId, 'tasks', 'can_edit')) return { error: 'Permission denied' }
      const allowed = ['title','description','status','priority','due_date','assigned_to']
      const updates: Record<string, unknown> = {}
      for (const k of allowed) { if (k in params) updates[k] = params[k] }
      if (updates.status === 'done') { updates.completed_at = new Date().toISOString(); updates.completed_by = userId }
      const { data: existingTask } = await admin.from('tasks').select('job_id, status, assigned_to').eq('id', params.task_id).single()
      const { data, error } = await admin.from('tasks').update(updates).eq('id', params.task_id).select().single()
      if (error) throw error
      if (existingTask) {
        if ('assigned_to' in updates && updates.assigned_to && updates.assigned_to !== existingTask.assigned_to) {
          await notify({ admin, userIds: [updates.assigned_to as string], type: 'task_assigned', title: `You were assigned: ${data.title}`, link: `/jobs/${data.job_id}/tasks` })
        }
        if (updates.status === 'blocked' && existingTask.status !== 'blocked') {
          const targets = await getJobNotifyTargets(data.job_id, admin)
          await notify({ admin, userIds: targets, type: 'task_blocked', title: `Task blocked: ${data.title}`, link: `/jobs/${data.job_id}/tasks` })
        }
      }
      return { task: data, message: 'Task updated' }
    }

    case 'list_schedule': {
      if (!await hasPerm(admin, userId, 'schedule', 'can_view')) return { error: 'Permission denied' }
      let q = admin.from('schedule_items').select('*').eq('job_id', params.job_id).order('sort_order').order('start_date')
      if (params.status) q = q.eq('status', params.status)
      const { data, error } = await q
      if (error) throw error
      return { items: data, count: data?.length ?? 0 }
    }

    case 'update_schedule_item': {
      if (!await hasPerm(admin, userId, 'schedule', 'can_edit')) return { error: 'Permission denied' }
      const allowed = ['title','description','status','start_date','end_date','sort_order','percent_complete','trade']
      const updates: Record<string, unknown> = {}
      for (const k of allowed) { if (k in params) updates[k] = params[k] }
      const { data, error } = await admin.from('schedule_items').update(updates).eq('id', params.item_id).select().single()
      if (error) throw error
      return { item: data, message: 'Schedule item updated' }
    }

    case 'list_budget': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      const { data, error } = await admin.from('budget_lines').select('*').eq('job_id', params.job_id).order('phase', { nullsFirst: false }).order('cost_code')
      if (error) throw error
      return { lines: data, count: data?.length ?? 0 }
    }

    case 'get_budget_summary': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      const [{ data: lines }, { data: actuals }, { data: cos }, { data: job }] = await Promise.all([
        admin.from('budget_lines').select('revised_budget, committed_cost, forecast_cost').eq('job_id', params.job_id),
        admin.from('actuals').select('amount, status').eq('job_id', params.job_id),
        admin.from('change_orders').select('amount, type, status').eq('job_id', params.job_id),
        admin.from('jobs').select('contract_amount, estimated_cost').eq('id', params.job_id).single(),
      ])
      type Line = { revised_budget: number; committed_cost: number; forecast_cost: number | null }
      type Actual = { amount: number; status: string }
      type CO = { amount: number; type: string; status: string }
      const totalBudget    = (lines ?? []).reduce((s: number, l: Line) => s + l.revised_budget, 0)
      const totalCommitted = (lines ?? []).reduce((s: number, l: Line) => s + l.committed_cost, 0)
      const totalForecast  = (lines ?? []).reduce((s: number, l: Line) => s + (l.forecast_cost ?? l.revised_budget), 0)
      const totalActuals   = (actuals ?? []).filter((a: Actual) => ['approved','paid'].includes(a.status)).reduce((s: number, a: Actual) => s + a.amount, 0)
      const approvedCOs    = (cos ?? []).filter((co: CO) => co.status === 'approved').reduce((s: number, co: CO) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0)
      return {
        contract_amount:   job?.contract_amount ?? null,
        revised_contract:  (job?.contract_amount ?? 0) + approvedCOs,
        total_budget: totalBudget, total_committed: totalCommitted,
        total_forecast: totalForecast, total_actuals: totalActuals,
        variance: totalBudget - totalForecast, approved_co_total: approvedCOs,
        line_count: lines?.length ?? 0,
      }
    }

    case 'list_change_orders': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      let q = admin.from('change_orders').select('*').eq('job_id', params.job_id).order('co_number')
      if (params.status) q = q.eq('status', params.status)
      const { data, error } = await q
      if (error) throw error
      return { change_orders: data, count: data?.length ?? 0 }
    }

    case 'create_change_order': {
      if (!await hasPerm(admin, userId, 'budget', 'can_create')) return { error: 'Permission denied' }
      const { data: existing } = await admin.from('change_orders').select('co_number').eq('job_id', params.job_id).order('co_number', { ascending: false }).limit(1)
      const lastNum = existing?.[0]?.co_number ? parseInt((existing[0].co_number as string).replace('CO-',''), 10) : 0
      const co_number = `CO-${String(lastNum + 1).padStart(3, '0')}`
      const { data, error } = await admin.from('change_orders').insert({
        job_id: params.job_id, co_number, title: String(params.title).trim(),
        type: params.type ?? 'additive', amount: Number(params.amount ?? 0),
        reason: trim(params.reason), status: 'draft', created_by: userId,
      }).select().single()
      if (error) throw error
      return { change_order: data, message: `Change order ${co_number} created` }
    }

    case 'list_actuals': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      let q = admin.from('actuals').select('*').eq('job_id', params.job_id).order('incurred_date', { ascending: false })
      if (params.budget_line_id) q = q.eq('budget_line_id', params.budget_line_id)
      const { data, error } = await q
      if (error) throw error
      return { actuals: data, count: data?.length ?? 0 }
    }

    case 'list_daily_logs': {
      if (!await hasPerm(admin, userId, 'logs', 'can_view')) return { error: 'Permission denied' }
      const limit = Math.min(Number(params.limit ?? 10), 50)
      const { data, error } = await admin.from('daily_logs').select('*').eq('job_id', params.job_id).order('log_date', { ascending: false }).limit(limit)
      if (error) throw error
      return { logs: data, count: data?.length ?? 0 }
    }

    case 'create_daily_log': {
      if (!await hasPerm(admin, userId, 'logs', 'can_create')) return { error: 'Permission denied' }
      const { data: userRow } = await admin.from('users').select('full_name').eq('id', userId).single()
      const { data, error } = await admin.from('daily_logs').insert({
        job_id: params.job_id,
        log_date: params.log_date ?? new Date().toISOString().slice(0, 10),
        logged_at: new Date().toISOString(),
        author_name: (userRow as { full_name?: string } | null)?.full_name || 'Fixer',
        work_performed: String(params.work_performed).trim(),
        weather_summary: trim(params.weather_summary),
        manpower_count: params.manpower_count ?? null,
        delays: trim(params.delays), safety_notes: trim(params.safety_notes),
        inspection_notes: trim(params.inspection_notes), created_by: userId,
      }).select().single()
      if (error) throw error
      return { log: data, message: 'Daily log created' }
    }

    case 'find_comparable_estimates': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      const scope = String(params.scope ?? '').trim()
      if (!scope) return { error: 'scope required' }

      const rawLimit = Number(params.limit ?? 3)
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 5) : 3

      const { data: matches, error: matchErr } = await admin.rpc('match_historical_estimates', {
        scope_text:  scope,
        match_limit: limit,
      })
      if (matchErr) throw matchErr
      if (!matches?.length) {
        return { comparables: [], message: 'No past estimates resembled that scope. Price from market rates and mark those lines source:"market".' }
      }

      const ids = (matches as { historical_estimate_id: string }[]).map(m => m.historical_estimate_id)

      const { data: estimates } = await admin
        .from('historical_estimates')
        .select('id, job_id, display_name, client_name, source_year, total_cost, line_count, areas')
        .in('id', ids)

      const { data: lines } = await admin
        .from('historical_estimate_lines')
        .select('historical_estimate_id, cost_code, division_name, cost_type, area, description, uom, quantity, unit_cost, markup_pct')
        .in('historical_estimate_id', ids)
        .order('row_number')

      // Preserve the RPC's relevance order — the .in() lookups come back arbitrarily ordered.
      const byId = new Map((estimates ?? []).map(e => [e.id, e]))

      return {
        scope,
        comparables: ids.map(id => {
          const e = byId.get(id) as Record<string, unknown> | undefined
          if (!e) return null
          return {
            estimate_id: id,
            job_name:    e.display_name,
            client_name: e.client_name,
            year:        e.source_year,
            total_cost:  Number(e.total_cost),
            areas:       e.areas,
            lines: (lines ?? [])
              .filter(l => l.historical_estimate_id === id)
              .map(l => ({
                cost_code:   l.cost_code,
                division:    l.division_name,
                cost_type:   l.cost_type,
                area:        l.area,
                description: l.description,
                uom:         l.uom,
                quantity:    Number(l.quantity),
                unit_cost:   Number(l.unit_cost),
                markup_pct:  Number(l.markup_pct),
              })),
          }
        }).filter(Boolean),
        guidance: 'Build the new estimate from these line items. Reuse cost_code, description, uom, unit_cost and markup_pct verbatim; adjust quantity to the new scope. Only invent a line when the scope needs work no comparable covers, and mark it source:"market". Then call add_estimate_lines.',
      }
    }

    case 'find_line_pricing': {
      if (!await hasPerm(admin, userId, 'budget', 'can_view')) return { error: 'Permission denied' }
      const item = String(params.item ?? '').trim()
      if (!item) return { error: 'item required' }
      return await findLinePricing(admin, item, Number(params.limit ?? 15))
    }

    case 'add_estimate_lines': {
      if (!await hasPerm(admin, userId, 'budget', 'can_create')) return { error: 'Permission denied' }
      const estimateId = String(params.estimate_id ?? '').trim()
      if (!estimateId) return { error: 'estimate_id required' }

      const incoming = Array.isArray(params.lines) ? params.lines as Record<string, unknown>[] : []
      if (incoming.length === 0) return { error: 'lines required' }

      // estimate_lines carries lead_id alongside estimate_id; take it from the estimate
      // rather than trusting the agent to pass a matching one.
      const { data: estimate, error: estErr } = await admin
        .from('estimates')
        .select('id, lead_id, title')
        .eq('id', estimateId)
        .single()
      if (estErr || !estimate) return { error: 'Estimate not found' }

      // Append after whatever is already on the estimate.
      const { data: lastLine } = await admin
        .from('estimate_lines')
        .select('sort_order')
        .eq('estimate_id', estimateId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const startOrder = Number((lastLine as { sort_order?: number } | null)?.sort_order ?? 0) + 1

      // Resolve and price through the same builder the in-app dispatcher uses. This used
      // to be a hand-rolled map that wrote a bare unit_cost and dropped the labor/material/
      // sub split, source_line_id and comp attribution entirely — so an estimate built over
      // SMS came out unreadable while the same request in the app came out right.
      const drafts = await buildAiEstimateLines(admin, incoming, startOrder)
      if (drafts.length === 0) return { error: 'No lines to add' }

      const sourced = drafts.filter(d => d.name_status === 'sourced')
      const unsourced = drafts.filter(d => d.name_status === 'unsourced')

      // Nobody is sitting in a review list over SMS, so an unsourceable line is refused
      // rather than guessed at. Mirrors the unattended path in api/agent/route.ts.
      if (unsourced.length > 0) {
        return {
          error: 'Unsourced lines cannot be added directly',
          needs_naming: unsourced.map(d => d.suggested_description ?? '(no description)'),
          message: `${unsourced.length} line${unsourced.length === 1 ? '' : 's'} matched no past JDC line or cost code. Every line has to carry a line_id from find_comparable_estimates / find_line_pricing, or a cost_code from the cost book — JDC's line names are a fixed vocabulary and must not be reworded or invented. Re-send only the lines you can cite, and tell the estimator what you could not price.`,
        }
      }

      const { data: inserted, error } = await admin
        .from('estimate_lines')
        .insert(sourced.map(d => ({
          estimate_id: estimateId,
          lead_id:     estimate.lead_id,
          description: d.description,
          phase:       d.phase,
          cost_code:   d.cost_code,
          uom:         d.uom,
          quantity:    d.quantity,
          unit_cost:   d.unit_cost,
          labor_cost:  d.labor_cost,
          material_cost: d.material_cost,
          sub_cost:    d.sub_cost,
          markup_pct:  d.markup_pct,
          sort_order:  d.sort_order,
          source:      d.source,
          source_line_id: d.source_line_id,
          cost_item_id: d.cost_item_id,
          comp_job_id: d.comp_job_id,
          comp_label:  d.comp_label,
          ai_rationale: d.ai_rationale,
        })))
        .select('id')
      if (error) throw error

      const total = sourced.reduce((s, r) => s + r.quantity * r.unit_cost, 0)
      return {
        added: inserted?.length ?? sourced.length,
        estimate: estimate.title,
        estimated_cost: Math.round(total * 100) / 100,
        message: `Added ${inserted?.length ?? sourced.length} line items to "${estimate.title}".`,
      }
    }

    case 'search_across_jobs': {
      if (!await hasPerm(admin, userId, 'jobs', 'can_view')) return { error: 'Permission denied' }
      const q = String(params.query ?? '').trim()
      if (!q) return { error: 'query required' }
      const modules = (params.modules as string[]) ?? ['jobs','tasks','schedule']
      const results: Record<string, unknown[]> = {}
      if (modules.includes('jobs')) {
        const { data } = await admin.from('jobs').select('id, job_number, name, status, client_name').or(`name.ilike.%${q}%,client_name.ilike.%${q}%,job_number.ilike.%${q}%`).limit(10)
        results.jobs = data ?? []
      }
      if (modules.includes('tasks') && await hasPerm(admin, userId, 'tasks', 'can_view')) {
        const { data } = await admin.from('tasks').select('id, job_id, title, status, priority').or(`title.ilike.%${q}%,description.ilike.%${q}%`).limit(10)
        results.tasks = data ?? []
      }
      if (modules.includes('schedule') && await hasPerm(admin, userId, 'schedule', 'can_view')) {
        const { data } = await admin.from('schedule_items').select('id, job_id, title, status, start_date, end_date').or(`title.ilike.%${q}%,description.ilike.%${q}%`).limit(10)
        results.schedule = data ?? []
      }
      return { results, query: q }
    }

    case 'navigate_to': {
      const url = String(params.url ?? '').trim()
      const label = String(params.label ?? '').trim() || undefined
      if (!url) return { error: 'url required' }
      const { data: ctx } = await admin
        .from('hermes_user_context')
        .select('preferences')
        .eq('user_id', userId)
        .single()
      const existing = (ctx?.preferences as Record<string, unknown>) ?? {}
      await admin.from('hermes_user_context').upsert({
        user_id: userId,
        preferences: { ...existing, pending_nav: { url, label } },
        updated_at: new Date().toISOString(),
      })
      return { navigating: true, url, label }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}
