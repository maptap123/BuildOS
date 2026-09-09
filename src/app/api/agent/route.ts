import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getJobNotifyTargets } from '@/lib/notifications'
import { normalizePhone } from '@/lib/twilio/client'
import {
  confirmPageUrl,
  flagForHuman,
  formatDateRange,
  googleCalendarUrl,
  jobAddress,
  loadAssignmentById,
  logMessage,
  recordResponse,
  type AssignmentContext,
} from '@/lib/schedule/assignments'
import { NextResponse } from 'next/server'
import { timingSafeEqual, randomUUID } from 'crypto'
import { findLinePricing } from '@/lib/estimates/linePricing'

// The gateway calls back into this route for every tool an estimating turn needs, and
// all of those round-trips run inside the caller's own window. Left unset it ran on the
// platform default, which is shorter than a single comp lookup.
export const maxDuration = 60

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
 *   list_jobs              { status?, search?, limit?, offset?, page? }
 *   get_job                { job_id }
 *   update_job_status      { job_id, status }
 *   list_tasks             { job_id, status?, priority? }
 *   create_task            { job_id, title, description?, priority?, due_date? }
 *   update_task            { task_id, ...fields }
 *   list_schedule          { job_id, status? }
 *   update_schedule_item   { item_id, ...fields }
 *
 * Schedule invite tools — used when a sub texts the JDC number. Fixer owns that
 * conversation; these read its context and record what was said back into BuildOS:
 *   list_schedule_invites       { phone }
 *   respond_to_schedule_invite  { invite_id, from_phone, answer, note? }
 *   log_schedule_invite_message { invite_id, from_phone, direction, body }
 *   flag_schedule_invite        { invite_id, from_phone, reason }
 *
 * SMS gate — call check_sms_sender on every inbound text before doing anything else:
 *   check_sms_sender            { phone, message? }
 *   approve_sms_sender          { phone, decided_by_phone, allow, note? }
 *   list_pending_sms_senders    { }
 *   list_budget            { job_id }
 *   list_change_orders     { job_id, status? }
 *   create_change_order    { job_id, title, type, amount, reason? }
 *   list_actuals           { job_id, budget_line_id? }
 *   get_budget_summary     { job_id }
 *
 * Estimating — Fixer prices new work from JDC's own historical estimates rather than
 * market rates. find_comparable_estimates first, then add_estimate_lines to write it:
 *   find_comparable_estimates   { scope, limit? }
 *   find_line_pricing           { item, limit? }   — one item across every past estimate
 *   add_estimate_lines          { estimate_id, lines[] }
 *
 *   list_daily_logs        { job_id, limit? }
 *   create_daily_log       { job_id, log_date?, work_performed, weather_summary?, manpower_count?, delays?, safety_notes?, inspection_notes? }
 *   search_across_jobs     { query, modules? }
 */
export async function POST(request: Request) {
  const admin = createAdminClient()
  const authResult = await authenticateAgentRequest(request, admin)
  if ('response' in authResult) return authResult.response
  const { user } = authResult

  // Require AI module permission
  const { data: aiPerm } = await admin
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
        const rawLimit = Number(params.limit ?? 50)
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 50
        const rawOffset = params.offset !== undefined
          ? Number(params.offset)
          : params.page !== undefined
            ? (Number(params.page) - 1) * limit
            : 0
        const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0

        const canSeeBudget = await hasPerm('budget', 'can_view')
        let query = admin
          .from('jobs')
          .select(
            `id, job_number, name, status, client_name, site_address, start_date, target_completion_date${canSeeBudget ? ', contract_amount' : ''}`,
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
        if (params.status) query = query.eq('status', params.status)
        if (params.search) query = query.or(`name.ilike.%${params.search}%,client_name.ilike.%${params.search}%,job_number.ilike.%${params.search}%`)
        const { data, error, count } = await query.range(offset, offset + limit - 1)
        if (error) throw error
        return ok({
          jobs: data,
          count: data?.length ?? 0,
          total_count: count ?? data?.length ?? 0,
          limit,
          offset,
          has_more: count === null ? false : offset + (data?.length ?? 0) < count,
        })
      }

      case 'get_job': {
        if (!await hasPerm('jobs', 'can_view')) return permError()
        const { data, error } = await admin
          .from('jobs')
          .select('*, pm:project_manager_id(full_name), super:superintendent_id(full_name)')
          .eq('id', params.job_id)
          .single()
        if (error || !data) return notFoundError('job')
        if (!await hasPerm('budget', 'can_view')) {
          const { contract_amount: _ca, estimated_cost: _ec, ...rest } = data
          void _ca; void _ec
          return ok(rest)
        }
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
          status: 'todo',
          created_by: user.id,
        }).select().single()
        if (error) throw error
        return ok({ task: data, message: 'Task created' })
      }

      case 'update_task': {
        if (!await hasPerm('tasks', 'can_edit')) return permError()
        if (!params.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })
        const allowed = ['title','description','status','priority','due_date','assigned_to']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) { if (k in params) updates[k] = params[k] }
        if (updates.status === 'done') { updates.completed_at = new Date().toISOString(); updates.completed_by = user.id }
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

      // ─── SCHEDULE INVITES (Fixer's SMS conversation with subs) ──────────
      // Every tool here is bound to the phone number that texted in. Knowing an
      // invite_id is not enough — the caller must also present the matching
      // number. Inbound SMS text is untrusted input reaching this agent, so a
      // sub cannot talk Fixer into answering for anyone but themselves.

      case 'list_schedule_invites': {
        if (!await hasPerm('schedule', 'can_view')) return permError()
        const phone = normalizePhone(params.phone as string)
        if (!phone) return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })

        const { data: rows } = await admin
          .from('schedule_assignments')
          .select('id')
          .eq('phone', phone)
          .in('status', ['sent', 'confirmed', 'declined'])
          .order('last_outbound_at', { ascending: false, nullsFirst: false })
          .limit(5)

        const invites = []
        for (const row of rows ?? []) {
          const ctx = await loadAssignmentById(admin, row.id)
          if (!ctx) continue

          const { data: msgs } = await admin
            .from('schedule_assignment_messages')
            .select('direction, body, created_at')
            .eq('assignment_id', row.id)
            .order('created_at', { ascending: false })
            .limit(10)

          invites.push({
            ...inviteFacts(ctx),
            recent_messages: (msgs ?? []).reverse(),
          })
        }

        return ok({
          invites,
          count: invites.length,
          unknown_facts: [
            'arrival time of day', 'gate or lockbox codes', 'who else is on site',
            'pay, invoicing, or terms', 'who supplies materials', 'parking',
          ],
        })
      }

      case 'respond_to_schedule_invite': {
        if (!await hasPerm('schedule', 'can_edit')) return permError()
        const answer = params.answer === 'confirmed' || params.answer === 'declined'
          ? params.answer
          : null
        if (!answer) {
          return NextResponse.json({ error: 'answer must be "confirmed" or "declined"' }, { status: 400 })
        }

        const ctx = await loadInviteForPhone(admin, params.invite_id, params.from_phone)
        if (!ctx) return inviteAuthError()
        if (ctx.assignment.status === 'cancelled') {
          return NextResponse.json({ error: 'This phase is no longer scheduled' }, { status: 409 })
        }

        const note = typeof params.note === 'string' ? params.note.trim() || null : null
        const updated = await recordResponse(admin, ctx, answer, { note, source: 'sms' })

        return ok({
          message: `Recorded ${updated.assignment.contact_name} as ${answer}. The project manager has been notified.`,
          // Text these to the sub after a confirmation.
          calendar_page_url: confirmPageUrl(updated.assignment.token),
          google_calendar_url: googleCalendarUrl(updated),
          ...inviteFacts(updated),
        })
      }

      case 'log_schedule_invite_message': {
        if (!await hasPerm('schedule', 'can_edit')) return permError()
        const direction = params.direction === 'inbound' || params.direction === 'outbound'
          ? params.direction
          : null
        const body = typeof params.body === 'string' ? params.body.trim() : ''
        if (!direction || !body) {
          return NextResponse.json(
            { error: 'direction ("inbound" or "outbound") and body are required' },
            { status: 400 }
          )
        }

        const ctx = await loadInviteForPhone(admin, params.invite_id, params.from_phone)
        if (!ctx) return inviteAuthError()

        await logMessage(admin, {
          assignmentId: ctx.assignment.id,
          direction,
          body,
          fromNumber: direction === 'inbound' ? ctx.assignment.phone : null,
          toNumber: direction === 'outbound' ? ctx.assignment.phone : null,
          // Anything Fixer says on this channel is the agent talking, not BuildOS.
          aiGenerated: direction === 'outbound',
        })

        const timestampField = direction === 'inbound' ? 'last_inbound_at' : 'last_outbound_at'
        await admin
          .from('schedule_assignments')
          .update({ [timestampField]: new Date().toISOString() })
          .eq('id', ctx.assignment.id)

        return ok({ message: 'Added to the thread the office sees' })
      }

      case 'flag_schedule_invite': {
        if (!await hasPerm('schedule', 'can_edit')) return permError()
        const reason = typeof params.reason === 'string' ? params.reason.trim() : ''
        if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })

        const ctx = await loadInviteForPhone(admin, params.invite_id, params.from_phone)
        if (!ctx) return inviteAuthError()

        await flagForHuman(admin, ctx, reason)
        return ok({
          message: `Flagged for the project manager, who has been notified. Tell ${ctx.assignment.contact_name} someone will follow up.`,
        })
      }

      // ─── WHO MAY TEXT FIXER ─────────────────────────────────────────────
      // Replaces a fixed allowlist. Unknown numbers are let in but held to the
      // schedule-invite tools until August approves them; an approval sticks so
      // he is asked once per number, never again.

      case 'check_sms_sender': {
        if (!await hasPerm('ai', 'can_view')) return permError()
        const phone = normalizePhone(params.phone as string)
        if (!phone) return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })

        const message = typeof params.message === 'string' ? params.message.trim() : ''
        const { data: existing } = await admin
          .from('sms_senders')
          .select('*')
          .eq('phone', phone)
          .maybeSingle()

        // A block is absolute — it outranks even an open invite.
        if (existing?.status === 'blocked') {
          await touchSender(admin, phone, message)
          return ok({ tier: 'blocked', phone, access: 'none', ask_owner: false })
        }

        // 1. One of the crew: Fixer acts with that person's own permissions.
        const { data: crew } = await admin
          .from('users')
          .select('id, full_name, email')
          .eq('phone', phone)
          .eq('is_active', true)
          .maybeSingle()

        if (crew) {
          await admin.from('sms_senders').upsert(
            {
              phone,
              status: 'allowed',
              label: crew.full_name || crew.email,
              resolved_user_id: crew.id,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'phone' }
          )
          return ok({
            tier: 'crew', phone, access: 'full', ask_owner: false,
            user: { id: crew.id, full_name: crew.full_name || crew.email },
          })
        }

        // 2. Already approved by August.
        if (existing?.status === 'allowed') {
          await touchSender(admin, phone, message)
          return ok({ tier: 'allowed', phone, access: 'full', label: existing.label, ask_owner: false })
        }

        // 3. Has an open schedule invite — the confirmation conversation only.
        const { data: invites } = await admin
          .from('schedule_assignments')
          .select('id, contact_name')
          .eq('phone', phone)
          .in('status', ['sent', 'confirmed', 'declined'])
          .limit(5)

        if (invites && invites.length > 0) {
          await touchSender(admin, phone, message, invites[0].contact_name)
          return ok({
            tier: 'invite', phone, access: 'schedule_invite_only',
            label: invites[0].contact_name, open_invites: invites.length, ask_owner: false,
          })
        }

        // 4. Nobody we know. Hold them and ask.
        const guess = await guessSenderName(admin, phone)
        await touchSender(admin, phone, message, guess)

        return ok({
          tier: 'unknown', phone, access: 'none', label: guess, ask_owner: true,
          approval_prompt:
            `New number texting JDC: ${phone}${guess ? ` (looks like ${guess})` : ''}. ` +
            `They said: "${message.slice(0, 120)}". Reply ALLOW to let them talk to me from now on, or BLOCK to ignore them.`,
        })
      }

      case 'approve_sms_sender': {
        if (!await hasPerm('ai', 'can_view')) return permError()
        const phone = normalizePhone(params.phone as string)
        const deciderPhone = normalizePhone(params.decided_by_phone as string)
        if (!phone || !deciderPhone) {
          return NextResponse.json({ error: 'phone and decided_by_phone are required' }, { status: 400 })
        }
        if (typeof params.allow !== 'boolean') {
          return NextResponse.json({ error: 'allow must be true or false' }, { status: 400 })
        }

        // Only someone who can administer BuildOS may open the gate, and only
        // from their own number — the decision arrives as an SMS, so the phone
        // is the whole proof of who sent it.
        const { data: decider } = await admin
          .from('users')
          .select('id, full_name')
          .eq('phone', deciderPhone)
          .eq('is_active', true)
          .maybeSingle()

        const canDecide = decider
          ? await hasModulePermOrAdminLocal(admin, decider.id)
          : false

        if (!decider || !canDecide) {
          return NextResponse.json(
            { error: 'That number is not allowed to approve senders. It must belong to a BuildOS admin.' },
            { status: 403 }
          )
        }

        const { data: updated, error } = await admin
          .from('sms_senders')
          .update({
            status: params.allow ? 'allowed' : 'blocked',
            approved_by: decider.id,
            approved_at: new Date().toISOString(),
            decided_note: typeof params.note === 'string' ? params.note.trim() || null : null,
          })
          .eq('phone', phone)
          .select('phone, status, label')
          .maybeSingle()

        if (error) throw error
        if (!updated) return NextResponse.json({ error: 'That number has not texted in.' }, { status: 404 })

        return ok({
          ...updated,
          message: params.allow
            ? `${updated.label ?? phone} can talk to Fixer from now on. You won't be asked again.`
            : `${updated.label ?? phone} is blocked and will be ignored.`,
        })
      }

      case 'list_pending_sms_senders': {
        if (!await hasPerm('ai', 'can_view')) return permError()
        const { data } = await admin
          .from('sms_senders')
          .select('phone, label, first_message, first_seen_at, last_seen_at, message_count')
          .eq('status', 'pending')
          .order('last_seen_at', { ascending: false })
          .limit(25)

        // A sub with an open invite is already being handled — say so, rather
        // than presenting them as somebody waiting on a decision.
        const phones = (data ?? []).map(row => row.phone)
        const { data: invited } = phones.length
          ? await admin
              .from('schedule_assignments')
              .select('phone')
              .in('phone', phones)
              .in('status', ['sent', 'confirmed', 'declined'])
          : { data: [] }
        const invitedPhones = new Set((invited ?? []).map(row => row.phone))

        return ok({
          pending: (data ?? []).map(row => ({
            ...row,
            has_open_invite: invitedPhones.has(row.phone),
          })),
          count: data?.length ?? 0,
        })
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

      case 'create_daily_log': {
        if (!await hasPerm('logs', 'can_create')) return permError()
        if (!params.job_id || !params.work_performed) {
          return NextResponse.json({ error: 'job_id and work_performed required' }, { status: 400 })
        }

        const { data: userRow } = await admin
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single()

        const { data, error } = await admin
          .from('daily_logs')
          .insert({
            job_id: params.job_id,
            log_date: params.log_date ?? new Date().toISOString().slice(0, 10),
            logged_at: new Date().toISOString(),
            author_name: userRow?.full_name || 'Fixer',
            work_performed: String(params.work_performed).trim(),
            weather_summary: trimOrNull(params.weather_summary),
            temperature_high: params.temperature_high ?? null,
            temperature_low: params.temperature_low ?? null,
            manpower_count: params.manpower_count ?? null,
            delays: trimOrNull(params.delays),
            safety_notes: trimOrNull(params.safety_notes),
            inspection_notes: trimOrNull(params.inspection_notes),
            ai_summary: trimOrNull(params.ai_summary),
            created_by: user.id,
          })
          .select()
          .single()
        if (error) throw error
        return ok({ log: data, message: 'Daily log created' })
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

      // ─── ESTIMATING ─────────────────────────────────────────────────────
      // Fixer prices new work from JDC's own past estimates rather than market
      // rates: find the comparables, build from their lines, write the result.
      case 'find_comparable_estimates': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        const scope = String(params.scope ?? '').trim()
        if (!scope) return NextResponse.json({ error: 'scope required' }, { status: 400 })

        const rawLimit = Number(params.limit ?? 3)
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 5) : 3

        const { data: matches, error: matchErr } = await admin.rpc('match_historical_estimates', {
          scope_text:  scope,
          match_limit: limit,
        })
        if (matchErr) throw matchErr
        if (!matches?.length) {
          return ok({ comparables: [], message: 'No past estimates resembled that scope. Price from market rates and mark those lines source:"market".' })
        }

        const ids = (matches as { historical_estimate_id: string }[]).map(m => m.historical_estimate_id)
        const [{ data: estimates }, { data: lines }] = await Promise.all([
          admin.from('historical_estimates')
            .select('id, display_name, client_name, source_year, total_cost, areas')
            .in('id', ids),
          admin.from('historical_estimate_lines')
            .select('id, historical_estimate_id, cost_code, division_name, cost_type, area, description, uom, quantity, unit_cost, markup_pct')
            .in('historical_estimate_id', ids)
            .order('row_number'),
        ])

        // Preserve the RPC's relevance order — .in() comes back arbitrarily ordered.
        const byId = new Map((estimates ?? []).map(e => [e.id, e as Record<string, unknown>]))

        return ok({
          scope,
          comparables: ids.flatMap(id => {
            const e = byId.get(id)
            if (!e) return []
            return [{
              estimate_id: id,
              job_name:    e.display_name,
              client_name: e.client_name,
              year:        e.source_year,
              total_cost:  Number(e.total_cost),
              areas:       e.areas,
              lines: (lines ?? [])
                .filter(l => l.historical_estimate_id === id)
                .map(l => ({
                  line_id: l.id,
                  cost_code: l.cost_code, division: l.division_name, cost_type: l.cost_type,
                  area: l.area, description: l.description, uom: l.uom,
                  quantity: Number(l.quantity), unit_cost: Number(l.unit_cost), markup_pct: Number(l.markup_pct),
                })),
            }]
          }),
          guidance: 'Build the new estimate from these line items. Pass each line back to add_estimate_lines with its line_id — the description and cost_code are taken from that row, so do not retype or reword them. JDC reuses a fixed vocabulary of line names and a paraphrase is treated as a different, unknown item. Adjust only quantity to the new scope. If the scope needs work no comparable covers, send that line with no line_id and no cost_code: it is held back for the estimator to name and price rather than guessed at.',
        })
      }

      case 'find_line_pricing': {
        if (!await hasPerm('budget', 'can_view')) return permError()
        const item = String(params.item ?? '').trim()
        if (!item) return NextResponse.json({ error: 'item required' }, { status: 400 })
        return ok(await findLinePricing(admin, item, Number(params.limit ?? 15)))
      }

      case 'add_estimate_lines': {
        if (!await hasPerm('budget', 'can_create')) return permError()
        const estimateId = String(params.estimate_id ?? '').trim()
        if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 })

        const incoming = Array.isArray(params.lines) ? params.lines as Record<string, unknown>[] : []
        if (incoming.length === 0) return NextResponse.json({ error: 'lines required' }, { status: 400 })

        // lead_id comes off the estimate rather than the agent, so a mismatched
        // one cannot attach lines to the wrong lead.
        const { data: estimate, error: estErr } = await admin
          .from('estimates')
          .select('id, lead_id, title')
          .eq('id', estimateId)
          .single()
        if (estErr || !estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

        // Is someone sitting in the builder waiting to review these? If so they get
        // staged for approval instead of landing on the estimate. See migration 042.
        const { data: session } = await admin
          .from('estimate_proposal_sessions')
          .select('estimate_id')
          .eq('estimate_id', estimateId)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        const startOrder = await nextEstimateSortOrder(admin, estimateId, !!session)
        const drafts = await buildAiEstimateLines(admin, incoming, startOrder)
        if (drafts.length === 0) return NextResponse.json({ error: 'No lines to add' }, { status: 400 })

        const sourced = drafts.filter(d => d.name_status === 'sourced')
        const unsourced = drafts.filter(d => d.name_status === 'unsourced')
        const total = sourced.reduce((sum, r) => sum + r.quantity * r.unit_cost, 0)
        const estimatedCost = Math.round(total * 100) / 100
        const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

        if (session) {
          const batchId = randomUUID()
          const { data: staged, error } = await admin
            .from('estimate_line_proposals')
            .insert(drafts.map(d => ({
              estimate_id: estimateId,
              batch_id:    batchId,
              description: d.description,
              name_status: d.name_status,
              suggested_description: d.suggested_description,
              phase:       d.phase,
              cost_code:   d.cost_code,
              uom:         d.uom,
              quantity:    d.quantity,
              unit_cost:   d.unit_cost,
              markup_pct:  d.markup_pct,
              sort_order:  d.sort_order,
              source:      d.source,
              source_line_id: d.source_line_id,
              cost_item_id: d.cost_item_id,
              comp_job_id: d.comp_job_id,
              comp_estimate_id: d.comp_estimate_id,
              comp_label:  d.comp_label,
              ai_rationale: d.ai_rationale,
            })))
            .select('id')
          if (error) throw error

          const n = staged?.length ?? drafts.length
          // Say plainly that nothing was written, or Fixer reports the job as done.
          let message = `Staged ${n} line${n === 1 ? '' : 's'} for review in the Estimate Builder. Nothing has been added to "${estimate.title}" yet — the estimator approves them line by line.`
          if (unsourced.length > 0) {
            message += ` ${unsourced.length} of them matched no past line or cost code, so ${unsourced.length === 1 ? 'it is' : 'they are'} held blank for the estimator to name and price: ${unsourced.map(d => d.suggested_description ?? '(no suggestion)').join('; ')}. Tell them which ${unsourced.length === 1 ? 'one needs' : 'ones need'} attention.`
          }
          if (sourced.length > 0) message += ` The ${sourced.length} sourced line${sourced.length === 1 ? '' : 's'} come to ${money(estimatedCost)}.`

          return ok({
            proposed: n,
            sourced: sourced.length,
            needs_naming: unsourced.length,
            estimate: estimate.title,
            estimated_cost: estimatedCost,
            message,
          })
        }

        // Unattended path (SMS, the floating panel): there is no review list to fix a
        // blank line in, so an unsourceable line is refused rather than guessed at.
        if (unsourced.length > 0) {
          return NextResponse.json({
            error: 'Unsourced lines cannot be added directly',
            needs_naming: unsourced.map(d => d.suggested_description ?? '(no description)'),
            message: `${unsourced.length} line${unsourced.length === 1 ? '' : 's'} matched no past JDC line or cost code. Every line has to carry a line_id from find_comparable_estimates / find_line_pricing, or a cost_code from the cost book — JDC's line names are a fixed vocabulary and must not be reworded or invented. Re-send only the lines you can cite, and tell the estimator what you could not price.`,
          }, { status: 422 })
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
            markup_pct:  d.markup_pct,
            sort_order:  d.sort_order,
            source:      d.source,
            source_line_id: d.source_line_id,
            cost_item_id: d.cost_item_id,
            comp_job_id: d.comp_job_id,
            comp_label: d.comp_label,
            ai_rationale: d.ai_rationale,
          })))
          .select('id')
        if (error) throw error

        return ok({
          added: inserted?.length ?? sourced.length,
          estimate: estimate.title,
          estimated_cost: estimatedCost,
          message: `Added ${inserted?.length ?? sourced.length} line items to "${estimate.title}".`,
        })
      }

      default:
        return NextResponse.json({
          error: `Unknown tool: ${tool}`,
          available_tools: [
            'list_jobs','get_job','update_job_status',
            'list_tasks','create_task','update_task',
            'list_schedule','update_schedule_item',
            'list_schedule_invites','respond_to_schedule_invite','log_schedule_invite_message','flag_schedule_invite',
            'check_sms_sender','approve_sms_sender','list_pending_sms_senders',
            'list_budget','get_budget_summary','list_change_orders','create_change_order','list_actuals',
            'list_daily_logs','create_daily_log',
            'find_comparable_estimates','find_line_pricing','add_estimate_lines',
            'search_across_jobs',
          ],
        }, { status: 400 })
    }
  } catch (e) {
    const msg = getErrorMessage(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data })
}

function permError() {
  return NextResponse.json({ error: 'Permission denied for this operation' }, { status: 403 })
}

/**
 * Loads a schedule invite only if the given phone number is the one it was sent
 * to. This is the authorization boundary for the invite tools: the sub's own
 * text is what reaches the agent, so possession of an invite_id must never be
 * enough on its own to answer for someone else.
 */
async function loadInviteForPhone(
  admin: ReturnType<typeof createAdminClient>,
  inviteId: unknown,
  fromPhone: unknown
): Promise<AssignmentContext | null> {
  if (typeof inviteId !== 'string' || !inviteId) return null
  const phone = normalizePhone(fromPhone as string)
  if (!phone) return null

  const ctx = await loadAssignmentById(admin, inviteId)
  if (!ctx || ctx.assignment.phone !== phone) return null
  return ctx
}

type Admin = ReturnType<typeof createAdminClient>

/** Records that a number texted in, without changing whether it's allowed. */
async function touchSender(
  admin: Admin,
  phone: string,
  message: string,
  label?: string | null
): Promise<void> {
  const { data: existing } = await admin
    .from('sms_senders')
    .select('id, message_count, first_message, label')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    await admin
      .from('sms_senders')
      .update({
        last_seen_at: new Date().toISOString(),
        message_count: existing.message_count + 1,
        label: existing.label ?? label ?? null,
      })
      .eq('id', existing.id)
    return
  }

  await admin.from('sms_senders').insert({
    phone,
    status: 'pending',
    label: label ?? null,
    first_message: message || null,
  })
}

/**
 * Best-effort name for an unrecognised number, so the approval question says
 * "looks like Bob's Plumbing" instead of just a bare number. Matched on the
 * last 7 digits because stored numbers are hand-entered in mixed formats.
 */
async function guessSenderName(admin: Admin, phone: string): Promise<string | null> {
  const tail = phone.replace(/\D/g, '').slice(-7)
  if (tail.length < 7) return null

  const { data: vendor } = await admin
    .from('vendors')
    .select('name, contact_name')
    .ilike('phone', `%${tail}%`)
    .limit(1)
    .maybeSingle()
  if (vendor) return vendor.contact_name || vendor.name

  const { data: contact } = await admin
    .from('contacts')
    .select('full_name')
    .ilike('phone', `%${tail}%`)
    .limit(1)
    .maybeSingle()
  return contact?.full_name ?? null
}

/** True if the user may administer BuildOS — the bar for opening the SMS gate. */
async function hasModulePermOrAdminLocal(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', userId)
    .eq('module', 'admin')
    .maybeSingle()
  return Boolean(data?.can_manage)
}

function inviteAuthError() {
  return NextResponse.json(
    { error: 'No schedule invite matches that invite_id and phone number.' },
    { status: 403 }
  )
}

/** The appointment facts Fixer is allowed to state to a sub. */
function inviteFacts(ctx: AssignmentContext) {
  return {
    invite_id: ctx.assignment.id,
    contact_name: ctx.assignment.contact_name,
    status: ctx.assignment.status,
    work: ctx.item.title,
    trade: ctx.item.trade,
    dates: formatDateRange(ctx.item.start_date, ctx.item.end_date),
    start_date: ctx.item.start_date,
    end_date: ctx.item.end_date,
    job: `${ctx.job.job_number} - ${ctx.job.name}`,
    site_address: jobAddress(ctx.job),
    scope_notes: ctx.item.description,
  }
}

/**
 * One shape for a line Fixer priced, whether it is about to be staged for review or
 * written straight onto the estimate. Both paths build it here so an approved proposal
 * and a direct write can never disagree about coercion or provenance.
 */
interface AiEstimateLineDraft {
  /** Copied from the cited source row. Empty when nothing could be cited. */
  description: string
  /** 'unsourced' means Fixer matched no real line — a person has to name it. */
  name_status: 'sourced' | 'unsourced'
  /** What the model would have called it. A hint for the estimator, never the name. */
  suggested_description: string | null
  phase: string | null
  cost_code: string | null
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
  sort_order: number
  source: 'ai_comp' | 'ai_market'
  source_line_id: string | null
  cost_item_id: string | null
  comp_job_id: string | null
  comp_estimate_id: string | null
  comp_label: string | null
  ai_rationale: string | null
}

/**
 * Where the next batch starts. Pending proposals count too — two turns in a row would
 * otherwise stage overlapping sort orders and interleave once both were approved.
 */
async function nextEstimateSortOrder(
  admin: ReturnType<typeof createAdminClient>,
  estimateId: string,
  includePending: boolean
): Promise<number> {
  const { data: lastLine } = await admin
    .from('estimate_lines')
    .select('sort_order')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  let highest = Number((lastLine as { sort_order?: number } | null)?.sort_order ?? 0)

  if (includePending) {
    const { data: lastProposal } = await admin
      .from('estimate_line_proposals')
      .select('sort_order')
      .eq('estimate_id', estimateId)
      .eq('status', 'pending')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    highest = Math.max(highest, Number((lastProposal as { sort_order?: number } | null)?.sort_order ?? 0))
  }

  return highest + 1
}

async function buildAiEstimateLines(
  admin: ReturnType<typeof createAdminClient>,
  incoming: Record<string, unknown>[],
  startOrder: number
): Promise<AiEstimateLineDraft[]> {
  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    return trimmed || null
  }

  // These land in numeric columns — a missing or non-numeric value must not become NaN.
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const norm = (v: string) => v.trim().toLowerCase()

  // ── Resolve every citation in batched lookups ────────────────────────────
  const lineIds = [...new Set(incoming.map(l => str(l.line_id)).filter(Boolean) as string[])]
  const codes   = [...new Set(incoming.map(l => str(l.cost_code)).filter(Boolean) as string[])]
  const typed   = [...new Set(incoming.map(l => str(l.description)).filter(Boolean) as string[])]

  const empty = { data: [] as Record<string, unknown>[] }

  const [sourceLines, catalogItems, typedHist, typedCatalog] = await Promise.all([
    lineIds.length
      ? admin.from('historical_estimate_lines')
          .select('id, historical_estimate_id, description, cost_code, uom')
          .in('id', lineIds)
      : Promise.resolve(empty),
    codes.length
      ? admin.from('cost_catalog').select('id, cost_code, title, uom').in('cost_code', codes)
      : Promise.resolve(empty),
    // Last resort: the model retyped a name that really is in the vocabulary. Accept it,
    // but snap to the stored spelling so the estimate stays internally consistent.
    typed.length
      ? admin.from('historical_estimate_lines')
          .select('id, historical_estimate_id, description, cost_code, uom')
          .in('description', typed)
      : Promise.resolve(empty),
    typed.length
      ? admin.from('cost_catalog').select('id, cost_code, title, uom').in('title', typed)
      : Promise.resolve(empty),
  ])

  // PostgREST hands back differently-shaped rows per table; one loose record type
  // keeps the lookup below from having to narrow a union at every access.
  const rows = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[]

  const byLineId = new Map(rows(sourceLines).map(r => [r.id as string, r]))
  const byCode = new Map(rows(catalogItems).map(r => [norm(r.cost_code as string), r]))

  const byName = new Map<string, Record<string, unknown>>()
  for (const r of rows(typedHist)) byName.set(norm(r.description as string), r)
  for (const r of rows(typedCatalog)) {
    const k = norm(r.title as string)
    if (!byName.has(k)) byName.set(k, r)
  }

  // Comp job attribution, resolved from whichever historical estimate the name came from.
  const compIds = new Set<string>()
  for (const l of incoming) {
    const c = str(l.comp_estimate_id)
    if (c) compIds.add(c)
  }
  for (const r of [...rows(sourceLines), ...rows(typedHist)]) {
    if (r.historical_estimate_id) compIds.add(r.historical_estimate_id as string)
  }

  const compById = new Map<string, { jobId: string | null; label: string | null }>()
  if (compIds.size > 0) {
    const { data: comps } = await admin
      .from('historical_estimates')
      .select('id, job_id, display_name')
      .in('id', [...compIds])
    for (const c of comps ?? []) {
      compById.set(c.id as string, {
        jobId: (c.job_id as string | null) ?? null,
        label: (c.display_name as string | null) ?? null,
      })
    }
  }

  return incoming.map((l, i) => {
    const citedLine = str(l.line_id)
    const citedCode = str(l.cost_code)
    const citedName = str(l.description)

    const sourceLine = citedLine ? byLineId.get(citedLine) : undefined
    const catalogItem = !sourceLine && citedCode ? byCode.get(norm(citedCode)) : undefined
    const namedMatch = !sourceLine && !catalogItem && citedName ? byName.get(norm(citedName)) : undefined
    const resolved = sourceLine ?? catalogItem ?? namedMatch

    // The description is whatever the source row calls it. What the model typed is never
    // the name: JDC reuses a fixed vocabulary and a paraphrase reads as a different item.
    // In cost_catalog that name is `title` — its `description` holds usage metadata.
    const canonicalName = resolved
      ? String(resolved.description ?? resolved.title ?? '').trim()
      : ''

    const fromHistorical = sourceLine ?? namedMatch
    const compEstimateId =
      (fromHistorical?.historical_estimate_id as string | undefined)
      ?? str(l.comp_estimate_id)
      ?? null
    const comp = compEstimateId ? compById.get(compEstimateId) : undefined

    const isHistorical = !!(fromHistorical?.historical_estimate_id)
    const catalogRow = catalogItem ?? (namedMatch && namedMatch.title ? namedMatch : undefined)

    return {
      // An unsourced line carries no name at all rather than a plausible-looking guess.
      description: canonicalName,
      name_status: (canonicalName ? 'sourced' : 'unsourced') as 'sourced' | 'unsourced',
      suggested_description: canonicalName ? null : citedName,
      phase: str(l.phase),
      cost_code: (resolved ? str(resolved.cost_code as string) : null) ?? citedCode,
      uom: (resolved ? str(resolved.uom as string) : null) ?? str(l.uom) ?? 'EA',
      quantity: num(l.quantity, 1),
      // An unnamed line gets no price either — a number beside a blank name invites
      // approving it unread.
      unit_cost: canonicalName ? num(l.unit_cost, 0) : 0,
      markup_pct: canonicalName ? num(l.markup_pct, 0) : 0,
      sort_order: startOrder + i,
      // source is constrained to manual|catalog|assembly|ai_comp|ai_market.
      source: (isHistorical ? 'ai_comp' : 'ai_market') as 'ai_comp' | 'ai_market',
      source_line_id: (fromHistorical?.id as string | undefined) ?? null,
      cost_item_id: (catalogRow?.id as string | undefined) ?? null,
      comp_job_id: comp?.jobId ?? null,
      comp_estimate_id: compEstimateId,
      comp_label: comp?.label ?? null,
      ai_rationale: str(l.rationale),
    }
  })
}

function notFoundError(resource: string) {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}

async function authenticateAgentRequest(
  request: Request,
  admin: ReturnType<typeof createAdminClient>
) {
  const configuredKey = process.env.HERMES_JDC_API_KEY
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (configuredKey && bearerToken && safeTokenEqual(bearerToken, configuredKey)) {
    const hermesUserId = process.env.HERMES_JDC_USER_ID
    if (!hermesUserId) {
      return {
        response: NextResponse.json(
          { error: 'Hermes service user is not configured' },
          { status: 500 }
        ),
      }
    }

    const { data: user, error } = await admin
      .from('users')
      .select('id, email, full_name, is_active')
      .eq('id', hermesUserId)
      .single()

    if (error || !user?.is_active) {
      return {
        response: NextResponse.json(
          { error: 'Hermes service user is invalid or inactive' },
          { status: 403 }
        ),
      }
    }

    return { user }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user }
}

function safeTokenEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
}

function trimOrNull(value: unknown) {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  return trimmed || null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}
