import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuickBooksApprover } from '@/lib/quickbooks/approvers'

export const dynamic = 'force-dynamic'

/** Pending changes (plus the 30 most recent decided ones) for the approvers' screen. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  if (!await isQuickBooksApprover(admin, user.id)) return NextResponse.json({ error: 'Only QuickBooks approvers can see this.' }, { status: 403 })

  // Anything that sat unapproved past its expiry is closed out here so it can never be approved late.
  await admin.from('qb_change_requests').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', new Date().toISOString())

  const cols = 'id, entity, action, qb_entity_id, payload, before, summary, reason, requested_note, status, decided_at, decision_note, error, result_qb_id, created_at, expires_at, job_id, decider:users!qb_change_requests_decided_by_fkey(full_name)'
  const [{ data: pending }, { data: recent }] = await Promise.all([
    admin.from('qb_change_requests').select(cols).eq('status', 'pending').order('created_at', { ascending: true }),
    admin.from('qb_change_requests').select(cols).neq('status', 'pending').order('created_at', { ascending: false }).limit(30),
  ])
  return NextResponse.json({ pending: pending ?? [], recent: recent ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
