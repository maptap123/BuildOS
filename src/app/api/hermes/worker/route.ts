import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { BACKGROUND_TOOLS, canUseBackground, UUID } from '@/lib/hermes/background'
import { HERMES_TOOLS } from '@/lib/hermes/tools'

export const maxDuration = 30

export async function POST(request: Request) {
  const key = process.env.FIXER_WORKER_KEY
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!key || key.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(key) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(key))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  if (!body) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const admin = createAdminClient()
  if (body.action === 'claim') {
    const { data: job, error } = await admin.rpc('claim_fixer_request')
    if (error) return Response.json({ error: 'Queue unavailable' }, { status: 503 })
    if (!job) return Response.json({ job: null })
    if (!await canUseBackground(admin, job.user_id)) {
      await admin.rpc('update_fixer_request', { p_id: job.id, p_lease: job.lease_token, p_action: 'fail', p_text: 'Access changed. Ask an administrator to restore AI and budget access.' })
      return Response.json({ job: null })
    }
    const [{ data: history, error: historyError }, { data: estimate, error: estimateError }, { data: lines, error: linesError }] = await Promise.all([
      admin.from('fixer_requests').select('message,result').eq('user_id', job.user_id).eq('estimate_id', job.estimate_id)
        .eq('status', 'completed').lt('created_at', job.created_at).order('created_at', { ascending: false }).limit(20),
      admin.from('estimates').select('id,title,job_name,scope_text,notes,internal_notes,markup_pct,is_locked,lead_id,job_id').eq('id', job.estimate_id).single(),
      admin.from('estimate_lines').select('description,phase,quantity,uom,unit_cost,labor_cost,material_cost,sub_cost,markup_pct').eq('estimate_id', job.estimate_id).order('sort_order').limit(1000),
    ])
    if (historyError || estimateError || linesError || !estimate || estimate.is_locked) {
      await admin.rpc('update_fixer_request', { p_id: job.id, p_lease: job.lease_token, p_action: 'fail', p_text: 'Could not load the estimate context, or the estimate is locked. Please try again after checking it.' })
      return Response.json({ job: null })
    }
    return Response.json({ job: { ...job, estimate: { ...estimate, lines }, tools: HERMES_TOOLS.filter(t => BACKGROUND_TOOLS.has(t.name)).map(t => ({ name: t.name, description: t.name === 'add_estimate_lines' ? 'Propose lines for human review on this request’s estimate. Never directly applies lines. Preserve source citations and labor/material/sub breakdowns.' : t.description, parameters: t.input_schema })), history: (history ?? []).reverse().flatMap(h => [
      { role: 'user', content: h.message }, { role: 'assistant', content: h.result },
    ]) } }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!['heartbeat', 'complete', 'fail'].includes(body.action) || !UUID.test(body.id ?? '')
    || !UUID.test(body.lease ?? '') || typeof body.text !== 'string' || body.text.length > 200000) {
    return Response.json({ error: 'Invalid update' }, { status: 400 })
  }
  const { data, error } = await admin.rpc('update_fixer_request', {
    p_id: body.id, p_lease: body.lease, p_action: body.action, p_text: body.text,
  })
  if (error) return Response.json({ error: 'Could not save worker update' }, { status: 503 })
  if (!data) return Response.json({ error: 'Request lease expired or request already ended' }, { status: 409 })
  return Response.json({ saved: true })
}
