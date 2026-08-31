import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { isTwilioConfigured, normalizePhone } from '@/lib/twilio/client'
import {
  buildInviteMessage,
  loadAssignmentById,
  sendAssignmentSms,
  type AssigneeType,
} from '@/lib/schedule/assignments'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

interface AssigneeInput {
  type: AssigneeType
  id: string
  /** Overrides the phone on the vendor/user/contact record for this invite only. */
  phone?: string | null
}

/** GET /api/schedule/[id]/assignments — who is on this phase and where each reply stands. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await hasModulePermOrAdmin(admin, user.id, 'schedule', 'can_view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: assignments, error } = await admin
    .from('schedule_assignments')
    .select('*')
    .eq('schedule_item_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (assignments ?? []).map(a => a.id)
  const { data: messages } = ids.length
    ? await admin
        .from('schedule_assignment_messages')
        .select('id, assignment_id, direction, body, intent, ai_generated, created_at')
        .in('assignment_id', ids)
        .order('created_at')
    : { data: [] }

  const byAssignment = new Map<string, unknown[]>()
  for (const msg of messages ?? []) {
    const list = byAssignment.get(msg.assignment_id) ?? []
    list.push(msg)
    byAssignment.set(msg.assignment_id, list)
  }

  return NextResponse.json({
    assignments: (assignments ?? []).map(a => ({
      ...a,
      messages: byAssignment.get(a.id) ?? [],
    })),
    sms_enabled: isTwilioConfigured(),
  })
}

/**
 * POST /api/schedule/[id]/assignments
 * Body: { assignees: [{ type, id, phone? }], send?: boolean }
 *
 * Assigns people to the phase and (unless send is false) texts each of them a
 * confirm/decline request from Fixer.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await hasModulePermOrAdmin(admin, user.id, 'schedule', 'can_edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    assignees?: AssigneeInput[]
    send?: boolean
  }

  const assignees = Array.isArray(body.assignees) ? body.assignees : []
  if (assignees.length === 0) {
    return NextResponse.json({ error: 'assignees required' }, { status: 400 })
  }

  const { data: item } = await admin
    .from('schedule_items')
    .select('id, job_id')
    .eq('id', id)
    .single()
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })

  const shouldSend = body.send !== false
  const results: { name: string; assignment_id?: string; sent: boolean; error?: string }[] = []

  for (const assignee of assignees) {
    const resolved = await resolveAssignee(admin, assignee)
    if (!resolved) {
      results.push({ name: assignee.id, sent: false, error: 'Person not found' })
      continue
    }

    const phone = normalizePhone(assignee.phone ?? resolved.phone)
    const idColumn =
      assignee.type === 'vendor' ? 'vendor_id' : assignee.type === 'user' ? 'user_id' : 'contact_id'

    // Re-assigning someone previously cancelled reopens the same row, so the SMS
    // transcript with that person stays in one place. The uniqueness indexes are
    // partial (NULL ids are distinct), which ON CONFLICT cannot infer — hence the
    // explicit lookup rather than an upsert.
    const { data: existing } = await admin
      .from('schedule_assignments')
      .select('id, status')
      .eq('schedule_item_id', id)
      .eq(idColumn, assignee.id)
      .maybeSingle()

    let assignmentId: string
    if (existing) {
      const { error } = await admin
        .from('schedule_assignments')
        .update({
          contact_name: resolved.name,
          phone,
          ...(existing.status === 'cancelled'
            ? { status: 'pending', responded_at: null, response_note: null, needs_attention: false }
            : {}),
        })
        .eq('id', existing.id)
      if (error) {
        results.push({ name: resolved.name, sent: false, error: error.message })
        continue
      }
      assignmentId = existing.id
    } else {
      const { data: created, error } = await admin
        .from('schedule_assignments')
        .insert({
          schedule_item_id: id,
          job_id: item.job_id,
          assignee_type: assignee.type,
          vendor_id: assignee.type === 'vendor' ? assignee.id : null,
          user_id: assignee.type === 'user' ? assignee.id : null,
          contact_id: assignee.type === 'contact' ? assignee.id : null,
          contact_name: resolved.name,
          phone,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (error || !created) {
        results.push({ name: resolved.name, sent: false, error: error?.message ?? 'Insert failed' })
        continue
      }
      assignmentId = created.id
    }

    if (!shouldSend) {
      results.push({ name: resolved.name, assignment_id: assignmentId, sent: false })
      continue
    }

    if (!phone) {
      results.push({
        name: resolved.name,
        assignment_id: assignmentId,
        sent: false,
        error: 'No mobile number on file',
      })
      continue
    }

    const ctx = await loadAssignmentById(admin, assignmentId)
    if (!ctx) {
      results.push({ name: resolved.name, assignment_id: assignmentId, sent: false, error: 'Load failed' })
      continue
    }

    const sms = await sendAssignmentSms(admin, ctx, buildInviteMessage(ctx), { markSent: true })
    results.push({
      name: resolved.name,
      assignment_id: assignmentId,
      sent: sms.ok,
      error: sms.error,
    })
  }

  const { data: assignments } = await admin
    .from('schedule_assignments')
    .select('*')
    .eq('schedule_item_id', id)
    .order('created_at')

  return NextResponse.json({ results, assignments: assignments ?? [] }, { status: 201 })
}

async function resolveAssignee(
  admin: ReturnType<typeof createAdminClient>,
  assignee: AssigneeInput
): Promise<{ name: string; phone: string | null } | null> {
  if (assignee.type === 'vendor') {
    const { data } = await admin
      .from('vendors')
      .select('name, contact_name, phone')
      .eq('id', assignee.id)
      .single()
    if (!data) return null
    return { name: data.contact_name || data.name, phone: data.phone }
  }

  if (assignee.type === 'user') {
    const { data } = await admin
      .from('users')
      .select('full_name, email, phone')
      .eq('id', assignee.id)
      .single()
    if (!data) return null
    return { name: data.full_name || data.email, phone: data.phone }
  }

  const { data } = await admin
    .from('contacts')
    .select('full_name, phone')
    .eq('id', assignee.id)
    .single()
  if (!data) return null
  return { name: data.full_name, phone: data.phone }
}
