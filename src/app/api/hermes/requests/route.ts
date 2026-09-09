import { backgroundGuard, PUBLIC_REQUEST_FIELDS, UUID } from '@/lib/hermes/background'

export const maxDuration = 30

export async function GET(request: Request) {
  const g = await backgroundGuard()
  if (g.response) return g.response
  const estimateId = new URL(request.url).searchParams.get('estimate_id') ?? ''
  if (!UUID.test(estimateId)) return Response.json({ error: 'Valid estimate_id required' }, { status: 400 })
  // Expiry only records failure; reading status never starts or advances execution.
  const { error: expireError } = await g.admin.rpc('expire_fixer_requests')
  if (expireError) return Response.json({ error: 'Could not refresh Fixer status' }, { status: 503 })
  const { data, error } = await g.admin.from('fixer_requests').select(PUBLIC_REQUEST_FIELDS)
    .eq('user_id', g.user.id).eq('estimate_id', estimateId).order('created_at')
  if (error) return Response.json({ error: 'Could not load saved requests' }, { status: 503 })
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const g = await backgroundGuard()
  if (g.response) return g.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 30000
    || !UUID.test(body.estimate_id ?? '') || !UUID.test(body.id ?? '')) {
    return Response.json({ error: 'Request id, estimate and message (up to 30,000 characters) required' }, { status: 400 })
  }
  // A lost submission response can be retried with the exact same id.
  const { data: existing } = await g.admin.from('fixer_requests').select(PUBLIC_REQUEST_FIELDS)
    .eq('id', body.id).eq('user_id', g.user.id).maybeSingle()
  if (existing) {
    if (existing.estimate_id !== body.estimate_id || existing.message !== body.message.trim()) {
      return Response.json({ error: 'Request id already used for another message' }, { status: 409 })
    }
    return Response.json(existing)
  }
  const { data: worker } = await g.admin.from('fixer_worker_health').select('seen_at').eq('id', 'hermes').maybeSingle()
  if (process.env.FIXER_BACKGROUND_ENABLED !== 'true' || !worker || Date.now() - Date.parse(worker.seen_at) > 120000) {
    return Response.json({ error: 'Fixer background worker is unavailable. Your message has not been submitted; try again shortly.' }, { status: 503 })
  }
  const { data, error } = await g.admin.rpc('enqueue_fixer_request', {
    p_id: body.id, p_user: g.user.id, p_estimate: body.estimate_id, p_message: body.message.trim(),
  })
  if (error) return Response.json({ error: error.code === '23505' ? 'This estimate already has a request in progress. Wait for it to finish before sending another.' : 'Could not queue request. The estimate may be locked or unavailable.' }, { status: 409 })
  return Response.json(data, { status: 202 })
}
