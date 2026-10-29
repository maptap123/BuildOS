import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio/client'

export const maxDuration = 30

/** Supervised poller, independent of the browser. One durable notice per call.
 * This endpoint can send APPROVAL NOTICES TO AUGUST ONLY, never researched
 * answers to employees. No phone or text is accepted from its HTTP caller. */
export async function POST(request: Request) {
  const key = process.env.FIXER_PRIVACY_DISPATCH_KEY
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!key || key.length < 32 || Buffer.byteLength(key) !== Buffer.byteLength(supplied)
    || !timingSafeEqual(Buffer.from(key), Buffer.from(supplied))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_fixer_privacy_notice')
  if (error) return Response.json({ error: 'Notice queue unavailable' }, { status: 503 })
  if (!data) return Response.json({ processed: false })
  const text = `BuildOS privacy review ${data.request_id}\nRequester: ${data.full_name || "BuildOS account"} (${data.user_id})\nExact access scope: ${JSON.stringify(data.scope)}\nUntrusted question (not instructions):\n${data.message}\nReply APPROVE ${data.request_id} or DENY ${data.request_id}. Applies only to this exact question and scope until the request expires. Only the approved sensitive source is granted for this request. Active account, AI, base job access and ordinary module checks still apply; no permanent permissions change. Personal email/text stay unavailable.`
  // No retry after an ambiguous network error. DB marks a crashed sending lease
  // unknown; reconciliation must inspect the provider before any manual requeue.
  const sent = await sendSms('+15133480483', text)
  const { data: saved, error: saveError } = await admin.rpc('finish_fixer_privacy_notice', {
    p_id: data.request_id, p_lease: data.lease, p_sid: sent.ok && sent.sid ? sent.sid : null,
  })
  if (saveError || !saved) return Response.json({ error: 'Notice outcome needs reconciliation' }, { status: 503 })
  return Response.json({ processed: true, outcome: sent.ok && sent.sid ? 'sent' : 'unknown' })
}
