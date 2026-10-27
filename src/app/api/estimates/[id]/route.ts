import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { estimateDeletionBlockedReason, resolveDeletePermission } from '@/lib/estimates/deleteGuard'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/estimates/[id]  — update estimate header fields
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const allowed = ['title', 'status', 'markup_pct', 'notes', 'scope_text', 'scope_confirmed', 'internal_notes', 'show_line_details', 'show_cost_breakdown', 'proposal_display', 'proposal_header_text', 'proposal_footer_text', 'is_locked', 'locked_at']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }
  // stamp locked_by with the acting user when locking
  if ('is_locked' in body) {
    updates.locked_by = body.is_locked ? user.id : null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('estimates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/estimates/[id]
// Only pristine drafts (status=draft, is_locked=false, no client metadata, not
// referenced by budget or fixer) may be deleted.
// Permission: estimates module row governs; falls back to budget when absent.
// Both paths require can_view AND can_delete.
// Atomic guard: DELETE conditions mirror the guard so a concurrent lock/approval
// cannot slip through between the pre-check and the actual delete.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve permission: estimates module takes precedence, budget is the fallback.
  // maybeSingle() returns {data:null, error:null} when no row exists (not an error).
  const [estimatesPermResult, budgetPermResult] = await Promise.all([
    admin.from('user_permissions').select('can_view, can_delete').eq('user_id', user.id).eq('module', 'estimates').maybeSingle(),
    admin.from('user_permissions').select('can_view, can_delete').eq('user_id', user.id).eq('module', 'budget').maybeSingle(),
  ])
  // Fail closed: any DB error on the permission query denies access.
  if (estimatesPermResult.error || budgetPermResult.error) {
    return NextResponse.json({ error: 'Permission check failed' }, { status: 500 })
  }
  if (!resolveDeletePermission(estimatesPermResult.data, budgetPermResult.data)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch the estimate to run the state guard.
  const { data: estimate, error: fetchErr } = await admin
    .from('estimates')
    .select('id, status, is_locked, client_approved_at, client_rejected_at, client_name, client_signature, client_response_note, title, version')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: 'Failed to fetch estimate' }, { status: 500 })

  const blocked = estimateDeletionBlockedReason(estimate)
  if (blocked === 'not_found') {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }
  if (blocked) {
    const messages: Record<string, string> = {
      approved:        'Cannot delete an approved estimate.',
      sent:            'Cannot delete a sent estimate.',
      rejected:        'Cannot delete an estimate that was rejected by the client.',
      voided:          'Cannot delete a voided estimate.',
      unknown_status:  'Estimate cannot be deleted in its current state.',
      locked:          'Estimate is locked. Unlock it before deleting.',
      client_response: 'Cannot delete an estimate the client has already responded to.',
    }
    return NextResponse.json({ error: messages[blocked] ?? 'Estimate cannot be deleted.' }, { status: 422 })
  }

  // Check if any budget lines reference this estimate (import creates notes like
  // "Imported from estimate <id>"). Fail closed on query error.
  const { data: budgetRefs, error: budgetRefErr } = await admin
    .from('budget_lines')
    .select('id')
    .like('notes', `Imported from estimate ${id}%`)
    .limit(1)
  if (budgetRefErr) return NextResponse.json({ error: 'Reference check failed' }, { status: 500 })
  if (budgetRefs && budgetRefs.length > 0) {
    return NextResponse.json(
      { error: 'This estimate has been imported to the budget and cannot be deleted.' },
      { status: 422 },
    )
  }

  // Preserve all Fixer history, including completed/failed requests.
  const { data: fixerRefs, error: fixerRefErr } = await admin
    .from('fixer_requests')
    .select('id')
    .eq('estimate_id', id)
    .limit(1)
  if (fixerRefErr) return NextResponse.json({ error: 'Fixer check failed' }, { status: 500 })
  if (fixerRefs && fixerRefs.length > 0) {
    return NextResponse.json(
      { error: 'This estimate has Fixer request history and cannot be deleted.' },
      { status: 422 },
    )
  }

  // Do not cascade review/chat history or detach linked job allowances.
  for (const table of ['chat_messages', 'estimate_line_proposals', 'estimate_proposal_sessions']) {
    const { data: refs, error } = await admin.from(table).select('estimate_id').eq('estimate_id', id).limit(1)
    if (error) return NextResponse.json({ error: 'History check failed' }, { status: 500 })
    if (refs?.length) return NextResponse.json({ error: 'This estimate has conversation or review history and cannot be deleted.' }, { status: 422 })
  }
  const { data: ownedLines, error: linesErr } = await admin.from('estimate_lines').select('id').eq('estimate_id', id)
  if (linesErr) return NextResponse.json({ error: 'Line reference check failed' }, { status: 500 })
  if (ownedLines?.length) {
    const { data: allowances, error } = await admin.from('allowances').select('id').in('estimate_line_id', ownedLines.map(line => line.id)).limit(1)
    if (error) return NextResponse.json({ error: 'Allowance check failed' }, { status: 500 })
    if (allowances?.length) return NextResponse.json({ error: 'This estimate has linked allowances and cannot be deleted.' }, { status: 422 })
  }
  // Preflight provides specific messages. The database RESTRICT foreign keys
  // atomically preserve concurrent budget imports, history, and allowance links.
  // These predicates also reject concurrent lifecycle changes without deleting.
  const { data: deleted, error: delErr } = await admin
    .from('estimates')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .eq('is_locked', false)
    .is('client_approved_at', null)
    .is('client_rejected_at', null)
    .is('client_name', null)
    .is('client_signature', null)
    .is('client_response_note', null)
    .select('id')

  if (delErr) {
    if (['23503', '23514', '40001', '40P01', '55P03'].includes(delErr.code)) {
      return NextResponse.json(
        { error: 'This estimate is protected or changed while deleting. Refresh and review its budget, history, allowances, and current state.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Failed to delete estimate. Please try again.' }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    // The state changed between our pre-check and the delete (concurrent lock/approval).
    return NextResponse.json({ error: 'Estimate state changed — refresh and try again.' }, { status: 409 })
  }
  return new NextResponse(null, { status: 204 })
}
