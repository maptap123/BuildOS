import { createAdminClient } from '@/lib/supabase/admin'
import { privacyWorkerAuthorized, PRIVACY_UUID } from '@/lib/hermes/employeePrivacy'
import { EMPLOYEE_TOOLS } from '@/lib/hermes/employeeTools'
export const maxDuration = 30
export async function POST(request: Request) {
  if (!privacyWorkerAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const admin = createAdminClient()
  if (body.action === 'claim') {
    const { data: job, error } = await admin.rpc('claim_fixer_employee_request')
    if (error) return Response.json({ error: 'Queue unavailable' }, { status: 503 })
    return Response.json({ job: job ? { ...job, tools: EMPLOYEE_TOOLS } : null }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!['heartbeat', 'complete', 'fail', 'hold'].includes(body.action) || !PRIVACY_UUID.test(body.id ?? '')
    || !PRIVACY_UUID.test(body.lease ?? '') || typeof body.text !== 'string' || body.text.length > 20000) {
    return Response.json({ error: 'Invalid update' }, { status: 400 })
  }
  const { data, error } = await admin.rpc('update_fixer_employee_request', {
    p_id: body.id, p_lease: body.lease, p_action: body.action, p_text: body.text,
  })
  if (error) return Response.json({ error: 'Queue unavailable' }, { status: 503 })
  if (!data) return Response.json({ error: 'Lease ended or access changed' }, { status: 409 })
  return Response.json({ saved: true })
}
