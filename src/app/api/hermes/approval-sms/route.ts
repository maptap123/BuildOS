import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** May receive a gateway-forwarded ORIGINAL form body and Twilio signature.
 * The configured URL is the exact externally registered Twilio webhook URL,
 * never a client-supplied/forwarded header. No general agent bearer can approve. */
export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN
  const url = process.env.FIXER_APPROVAL_SMS_URL
  const account = process.env.TWILIO_ACCOUNT_SID
  if (!token || !url || !account || !url.startsWith('https://')) {
    return Response.json({ error: 'Approval verification unavailable' }, { status: 503 })
  }
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return Response.json({ error: 'Form required' }, { status: 400 })
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 16000) return Response.json({ error: 'Form too large' }, { status: 413 })
  const form = new URLSearchParams(raw)
  const keys = [...form.keys()]
  if (keys.length !== new Set(keys).size) return Response.json({ error: 'Duplicate fields' }, { status: 400 })
  const material = url + keys.sort().map(key => key + form.get(key)).join('')
  const expected = createHmac('sha1', token).update(material).digest('base64')
  const supplied = request.headers.get('x-twilio-signature') ?? ''
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    || form.get('AccountSid') !== account || form.get('From') !== '+15133480483'
    || form.get('To') !== '+18334087055') {
    return Response.json({ error: 'Invalid SMS provenance' }, { status: 403 })
  }
  const decision = form.get('Body')?.trim().match(new RegExp(`^(APPROVE|DENY) (${UUID})$`, 'i'))
  const sid = form.get('MessageSid') ?? ''
  if (!decision || !/^SM[0-9a-f]{32}$/i.test(sid)) {
    return Response.json({ error: 'Use APPROVE or DENY followed by the exact request ID' }, { status: 400 })
  }
  const { data, error } = await createAdminClient().rpc('decide_fixer_privacy_request', {
    p_id: decision[2].toLowerCase(), p_from: form.get('From'), p_approve: decision[1].toUpperCase() === 'APPROVE', p_sid: sid,
  })
  if (error) return Response.json({ error: 'Could not record decision' }, { status: 503 })
  if (!data) return Response.json({ error: 'Request unavailable, expired, already decided or access changed' }, { status: 409 })
  // Approval is not an access upgrade and does not yet start an unscoped model.
  return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
}
