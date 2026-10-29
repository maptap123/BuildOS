import { randomUUID } from 'node:crypto'
import { employeeGuard, PRIVACY_UUID } from '@/lib/hermes/employeePrivacy'
import { isTwilioConfigured, normalizePhone } from '@/lib/twilio/client'

export const maxDuration = 30

/** Auth account is the identity. Phone is optional delivery, never onboarding. */
export async function POST(request: Request) {
  const guard = await employeeGuard()
  if (guard.response) return guard.response
  if (process.env.FIXER_PRIVACY_REVIEW_ENABLED !== 'true') {
    return Response.json({ error: 'Fixer is not configured. No research has started.' }, { status: 503 })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1000
    || (body.conversationId != null && !PRIVACY_UUID.test(body.conversationId))) {
    return Response.json({ error: 'A question up to 1,000 characters and valid conversation ID are required' }, { status: 400 })
  }
  const retryId = request.headers.get('idempotency-key')
  if (retryId && !PRIVACY_UUID.test(retryId)) return Response.json({ error: 'Invalid retry key' }, { status: 400 })
  const { data, error } = await guard.admin.rpc('enqueue_fixer_employee_request', {
    p_id: retryId ?? randomUUID(), p_user: guard.user.id, p_message: body.message.trim(), p_conversation: body.conversationId ?? null,
  })
  if (error || !data) return Response.json({ error: 'Could not save your question. Please try again.' }, { status: 503 })
  const { data: profile } = await guard.admin.from('users').select('phone').eq('id', guard.user.id).single()
  const smsEnabled = isTwilioConfigured() && !!normalizePhone(profile?.phone) && !!data.sms_enabled
  const text = `Your question is saved${data.status === 'held' ? " for August's review" : ' for Fixer'}. You can close the app. ${smsEnabled ? 'I will text your saved account phone when the answer is ready.' : 'The answer will be saved here; text delivery is not configured for your account.'}`
  const events = [{ type: 'queued', requestId: data.id, status: data.status, smsEnabled }, { type: 'delta', text }, { type: 'done', requestId: data.id }]
  return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  })
}
