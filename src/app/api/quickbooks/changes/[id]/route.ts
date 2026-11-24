import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuickBooksApprover } from '@/lib/quickbooks/approvers'
import { executeApprovedChange, type ChangeRow } from '@/lib/quickbooks/approvedWrite'

export const maxDuration = 60

/** Approve or reject one proposed QuickBooks change. Approving is the only path that writes to QuickBooks. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad request id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  if (!await isQuickBooksApprover(admin, user.id)) return NextResponse.json({ error: 'Only QuickBooks approvers can decide this.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { decision?: string; note?: string } | null
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (body?.decision === 'reject') {
    const { data, error } = await admin.from('qb_change_requests')
      .update({ status: 'rejected', decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note })
      .eq('id', id).eq('status', 'pending').select('id').maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'That request is no longer pending.' }, { status: 409 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }
  if (body?.decision !== 'approve') return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 })

  // Atomic: only one click can win, and the database re-checks that the caller is an approver.
  const claim = await admin.rpc('claim_qb_change', { p_id: id, p_actor: user.id })
  if (claim.error || !claim.data) {
    return NextResponse.json({ error: claim.error?.message ?? 'That request is no longer pending.' }, { status: 409 })
  }
  const row = claim.data as ChangeRow

  try {
    const { qbId, result } = await executeApprovedChange(admin, row)
    await admin.from('qb_change_requests').update({ status: 'executed', result, result_qb_id: qbId, decision_note: note, error: null }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'executed', qb_id: qbId })
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Unknown error'
    const unsure = /timeout|aborted|fetch failed/i.test(raw)
    const msg = unsure ? `${raw}. QuickBooks may or may not have received it: check QuickBooks before asking again.` : raw
    await admin.from('qb_change_requests').update({ status: 'failed', error: msg, decision_note: note }).eq('id', id)
    return NextResponse.json({ ok: false, status: 'failed', error: msg }, { status: 502 })
  }
}
