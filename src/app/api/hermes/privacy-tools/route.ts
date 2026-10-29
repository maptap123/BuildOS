import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVACY_UUID } from '@/lib/hermes/employeePrivacy'
export const maxDuration = 30
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer privacy\.([^.]+)\.([^.]+)$/)
  if (!token || !PRIVACY_UUID.test(token[1]) || !PRIVACY_UUID.test(token[2])) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.tool !== 'string' || body.tool.length > 80 || !body.params || Array.isArray(body.params)
    || typeof body.params !== 'object' || JSON.stringify(body.params).length > 2000) return Response.json({ error: 'Invalid tool request' }, { status: 400 })
  // DB locks this request; checks current identity, lease, grant, modules, record IDs
  // and safe projection in the SAME transaction as retrieval. No caller user ID.
  const { data, error } = await createAdminClient().rpc('read_fixer_employee_tool', {
    p_id: token[1], p_lease: token[2], p_tool: body.tool, p_params: body.params,
  })
  if (error || !data) return Response.json({ error: 'Read unavailable' }, { status: 503 })
  if (data.error) return Response.json({ error: data.error }, { status: data.error === 'invalid_parameters' ? 400 : 409 })
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
