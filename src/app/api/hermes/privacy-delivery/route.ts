import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { employeeSmsConfigured, sendEmployeeSms, lookupEmployeeSms } from '@/lib/hermes/employeeSms'
export const maxDuration = 30
/** Supervised independent poll. No caller body, destination or generated text. */
export async function POST(request: Request) {
  const key = process.env.FIXER_PRIVACY_DISPATCH_KEY
  const value = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!key || key.length < 32 || Buffer.byteLength(key) !== Buffer.byteLength(value)
    || !timingSafeEqual(Buffer.from(key), Buffer.from(value))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!employeeSmsConfigured()) return Response.json({ error: 'SMS unavailable' }, { status: 503 })
  const admin = createAdminClient()
  const { data: claim, error } = await admin.rpc('claim_fixer_employee_delivery')
  if (error) return Response.json({ error: 'Delivery queue unavailable' }, { status: 503 })
  if (!claim) return Response.json({ processed: false })
  let outcome
  if (claim.action === 'reconcile') {
    outcome = await lookupEmployeeSms(claim.provider_sid, claim.phone)
  } else {
    // Last-moment trusted profile re-read, duplicate-phone and disclosure checks.
    const { data: current, error: authError } = await admin.rpc('authorize_fixer_employee_delivery', { p_id: claim.request_id, p_lease: claim.lease })
    if (authError) return Response.json({ error: 'Delivery authorization unavailable' }, { status: 503 })
    if (!current) return Response.json({ processed: false, outcome: 'cancelled' })
    outcome = await sendEmployeeSms(current.phone, current.body)
  }
  const { data: saved, error: saveError } = await admin.rpc('finish_fixer_employee_delivery', {
    p_id: claim.request_id, p_lease: claim.lease, p_state: outcome.state, p_sid: outcome.sid ?? null,
  })
  if (saveError || !saved) return Response.json({ error: 'Delivery needs reconciliation' }, { status: 503 })
  return Response.json({ processed: true, outcome: outcome.state })
}
