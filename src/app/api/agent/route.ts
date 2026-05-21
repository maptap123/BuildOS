import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/agent
 *
 * Hermes agent tool dispatcher. Accepts a structured tool call from the AI
 * agent and routes it to the appropriate data operation with full permission
 * enforcement.
 *
 * Request body:
 *   { tool: string, params: Record<string, unknown> }
 *
 * Available tools (Hermes tool schema):
 *   list_jobs              { status?, search? }
 *   get_job                { job_id }
 *   update_job_status      { job_id, status }
 *   list_tasks             { job_id, status?, priority? }
 *   create_task            { job_id, title, description?, priority?, due_date?, estimated_hours? }
 *   update_task            { task_id, ...fields }
 *   list_schedule          { job_id, status? }
 *   update_schedule_item   { item_id, ...fields }
 *   list_budget            { job_id }
 *   list_change_orders     { job_id, status? }
 *   create_change_order    { job_id, title, type, amount, reason? }
 *   list_actuals           { job_id, budget_line_id? }
 *   get_budget_summary     { job_id }
 *   list_daily_logs        { job_id, limit? }
 *   search_across_jobs     { query, modules? }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Require AI module permission
  const { data: aiPerm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'ai')
    .single()

  if (!aiPerm?.can_view) {
    return NextResponse.json({ error: 'AI module access not granted' }, { status: 403 })
  }

  const body = await request.json()
  const { tool, params = {} } = body

  if (!tool || typeof tool !== 'string') {
    return NextResponse.json({ error: 'tool name required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Helper: check module permission
  async function hasPerm(module: string, flag: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') {
    const { data } = await admin
      .from('user_permissions')
      .select(flag)
      .eq('user_id', user!.id)
      .eq('module', module)
      .single()
    return (data as Record<string, boolean> | null)?.[flag] ?? false
  }

  try {
    switch (tool) {

      // ─── JOBS ───────────────────────────────────────────────────────────
      case 'list_jobs': {
        if (!await hasPerm('jobs', 'can_view')) return permError()
        let query = admin.from('jobs').select('id, job_number, name, status, client_name, site_address, start_date, target_completion_date, contract_amount').order('created_at', { ascending: false })
        if (params.status) query = query.eq('status', params.status)
        if (params.search) query = query.or(`name.ilike.%${params.search}%,client_name.ilike.%${params.search}%,job_number.ilike.%${params.search}%`)
        const { data, error } = await query.limit(50)
        if (error) throw error
        return ok({ jobs: data, count: data?.length ?? 0 })
      }

      case 'get_job': {
        if (!await hasPerm('jobs', 'can_view')) return permError()
        const { data, error } = await admin
          .from('jobs')
          .select('*, pm:project_manager_id(full_name), super:superintendent_id(full_name)')
          .eq('id', params.job_id)
          .single()
        if (error || !data) return notFoundError('job')
        return ok(data)
      }

      case 'update_job_status': {
        if (!await hasPerm('jobs', 'can_edit')) return permError()
        const validStatuses = ['lead','estimating','scheduled','active','on_hold','completed','closed']
        if (!validStatuses.includes(params.status)) {
          return NextResponse.json({ error: `Invalid status. Valid values: ${validStatuses.join(', ')}` }, { status: 400 })
        }
        const { data, error } = await admin.from('jobs').update({ status: params.status }).eq('id', params.job_id).select().single()
        if (error) throw error
        return ok({ job: data, message: `Job status updated to ${params.status}` })
      }

      // ─── TASKS ──────────────────────────────────────────────────────────
      case 'list_tasks': {
        if (!await hasPerm('tasks', 'can_view')) return permError()
        let query = admin.from('tasks').select('*').eq('job_id', params.job_id).order('priority', { ascending: false }).order('due_date', { nullsFirst: false })
        if (params.status)   query = query.eq('status', params.status)
        if (params.priority) query = query.eq('priority', params.priority)
        const { data, error } = await query
        if (error) throw error
        return ok({ tasks: data, count: data?.length ?? 0 })
      }

      case 'create_task': {
        if (!await hasPerm('tasks', 'can_create')) return permError()
        if (!params.job_id || !params.title) return NextResponse.json({ error: 'job_id and title required' }, { status: 400 })
        const { data, error } = await admin.from('tasks').insert({
          job_id: params.job_id,
          title: String(params.title).trim(),
          description: params.description ?? null,
          priority: params.priority ?? 'medium',
          due_date: params.due_date ?? null,
          estimated_hours: params.estimated_hours ?? null,
          tags: params.tags ?? [],
          status: 'todo',
          created_by: user.id,
        }).select().single()
        if (error) throw error
        return ok({ task: data, message: 'Task created' })
      }

      case 'update_task': {
        if (!await hasPerm('tasks', 'can_edit')) return permError()
        if (!params.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })
        const allowed = ['title','description','status','priority','due_date','assigned_to','estimated_hours','actual_hours','tags']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) { if (k in params) updates[k] = params[k] }
        if (updates.status === 'done') { updates.completed_at = new Date().toISOString(); updates.completed_by = user.id }
        const { data, error } = await admin.from('tasks').update(updates).eq('id', params.task_id).select().single()
        if (error) throw error
        return ok({ task: data, message: 'Task updated' })
      }

      // ─── SCHEDULE ───────────────────────────────────────────────────────
      case 'list_schedule': {
        if (!await hasPerm('schedule', 'can_view')) return permError()
        let query = admin.from('schedule_items').select('*').eq('job_id', params.job_id).order('sort_order').order('start_date')
        if (params.status) query = query.eq('status', params.status)
        const { data, error } = await query
        if (error) throw error
        return ok({ items: data, count: data?.length ?? 0 })
      }

      case 'update_schedule_item': {
        if (!await hasPerm('schedule', 'can_edit')) return permError()
        if (!params.item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })
        const allowed = ['title','description','status','start_date','end_date','sort_order','percent_complete','trade']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) { if (k in params) updates[k] = params[k] }
        const { data, error } = await admin.from('schedule_items').update(updates).eq('id', params.item_id).select().single()
        if (error) throw error
        return ok({ item: data, message: 'Schedule item updated' })
      }

      // ─── BUDGET ─────────────────────────────────────────────────────────
      case 'list_budget': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        const { data, error } = await admin.from('budget_lines').select('*').eq('job_id', params.job_id).order('phase', { nullsFirst: false }).order('cost_code')
        if (error) throw error
        return ok({ lines: data, count: data?.length ?? 0 })
      }

      case 'get_budget_summary': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        const [{ data: lines }, { data: actuals }, { data: cos }, { data: job }] = await Promise.all([
          admin.from('budget_lines').select('revised_budget, committed_cost, forecast_cost').eq('job_id', params.job_id),
          admin.from('actuals').select('amount, status').eq('job_id', params.job_id),
          admin.from('change_orders').select('amount, type, status').eq('job_id', params.job_id),
          admin.from('jobs').select('contract_amount, estimated_cost').eq('id', params.job_id).single(),
        ])
        const totalBudget    = (lines ?? []).reduce((s: number, l: {revised_budget: number}) => s + l.revised_budget, 0)
        const totalCommitted = (lines ?? []).reduce((s: number, l: {committed_cost: number}) => s + l.committed_cost, 0)
        const totalForecast  = (lines ?? []).reduce((s: number, l: {forecast_cost: number | null, revised_budget: number}) => s + (l.forecast_cost ?? l.revised_budget), 0)
        const totalActuals   = (actuals ?? []).filter((a: {status: string}) => ['approved','paid'].includes(a.status)).reduce((s: number, a: {amount: number}) => s + a.amount, 0)
        const approvedCOs    = (cos ?? []).filter((co: {status: string}) => co.status === 'approved').reduce((s: number, co: {amount: number, type: string}) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0)
        return ok({
          contract_amount:   job?.contract_amount ?? null,
          revised_contract:  (job?.contract_amount ?? 0) + approvedCOs,
          total_budget:      totalBudget,
          total_committed:   totalCommitted,
          total_forecast:    totalForecast,
          total_actuals:     totalActuals,
          variance:          totalBudget - totalForecast,
          approved_co_total: approvedCOs,
          line_count:        lines?.length ?? 0,
        })
      }

      case 'list_change_orders': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        let query = admin.from('change_orders').select('*').eq('job_id', params.job_id).order('co_number')
        if (params.status) query = query.eq('status', params.status)
        const { data, error } = await query
        if (error) throw error
        return ok({ change_orders: data, count: data?.length ?? 0 })
      }

      case 'create_change_order': {
        if (!await hasPerm('budget', 'can_create')) return permError()
        if (!params.job_id || !params.title) return NextResponse.json({ error: 'job_id and title required' }, { status: 400 })
        // Auto-number
        const { data: existing } = await admin.from('change_orders').select('co_number').eq('job_id', params.job_id).order('co_number', { ascending: false }).limit(1)
        const lastNum = existing?.[0]?.co_number ? parseInt(existing[0].co_number.replace('CO-',''), 10) : 0
        const co_number = `CO-${String(lastNum + 1).padStart(3, '0')}`
        const { data, error } = await admin.from('change_orders').insert({
          job_id: params.job_id, co_number, title: String(params.title).trim(),
          type: params.type ?? 'additive', amount: Number(params.amount ?? 0),
          reason: params.reason ?? null, status: 'draft', created_by: user.id,
        }).select().single()
        if (error) throw error
        return ok({ change_order: data, message: `Change order ${co_number} created` })
      }

      case 'list_actuals': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        let query = admin.from('actuals').select('*').eq('job_id', params.job_id).order('incurred_date', { ascending: false })
        if (params.budget_line_id) query = query.eq('budget_line_id', params.budget_line_id)
        const { data, error } = await query
        if (error) throw error
        return ok({ actuals: data, count: data?.length ?? 0 })
      }

      // ─── LOGS ───────────────────────────────────────────────────────────
      case 'list_daily_logs': {
        if (!await hasPerm('logs', 'can_view')) return permError()
        const limit = Math.min(Number(params.limit ?? 10), 50)
        const { data, error } = await admin
          .from('daily_logs')
          .select('*')
          .eq('job_id', params.job_id)
          .order('log_date', { ascending: false })
          .limit(limit)
        if (error) throw error
        return ok({ logs: data, count: data?.length ?? 0 })
      }

      // ─── CROSS-MODULE SEARCH ─────────────────────────────────────────────
      case 'search_across_jobs': {
        if (!await hasPerm('jobs', 'can_view')) return permError()
        const q = String(params.query ?? '').trim()
        if (!q) return NextResponse.json({ error: 'query required' }, { status: 400 })
        const modules = (params.modules as string[]) ?? ['jobs', 'tasks', 'schedule']
        const results: Record<string, unknown[]> = {}
        if (modules.includes('jobs')) {
          const { data } = await admin.from('jobs').select('id, job_number, name, status, client_name').or(`name.ilike.%${q}%,client_name.ilike.%${q}%,job_number.ilike.%${q}%`).limit(10)
          results.jobs = data ?? []
        }
        if (modules.includes('tasks') && await hasPerm('tasks', 'can_view')) {
          const { data } = await admin.from('tasks').select('id, job_id, title, status, priority').or(`title.ilike.%${q}%,description.ilike.%${q}%`).limit(10)
          results.tasks = data ?? []
        }
        if (modules.includes('schedule') && await hasPerm('schedule', 'can_view')) {
          const { data } = await admin.from('schedule_items').select('id, job_id, title, status, start_date, end_date').or(`title.ilike.%${q}%,description.ilike.%${q}%,trade.ilike.%${q}%`).limit(10)
          results.schedule = data ?? []
        }
        return ok({ results, query: q })
      }

      default:
        return NextResponse.json({
          error: `Unknown tool: ${tool}`,
          available_tools: [
            'list_jobs','get_job','update_job_status',
            'list_tasks','create_task','update_task',
            'list_schedule','update_schedule_item',
            'list_budget','get_budget_summary','list_change_orders','create_change_order','list_actuals',
            'list_daily_logs',
            'search_across_jobs',
          ],
        }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data })
}

function permError() {
  return NextResponse.json({ error: 'Permission denied for this operation' }, { status: 403 })
}

function notFoundError(resource: string) {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}
