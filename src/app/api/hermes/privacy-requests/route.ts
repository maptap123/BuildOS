import { employeeGuard } from '@/lib/hermes/employeePrivacy'

/** DB rechecks requester and every source module before returning a result. */
export async function GET() {
  const guard = await employeeGuard()
  if (guard.response) return guard.response
  const { data, error } = await guard.admin.rpc('list_fixer_employee_requests', { p_user: guard.user.id })
  if (error || !Array.isArray(data)) return Response.json({ error: 'Saved requests unavailable' }, { status: 503 })
  const rows = data.map(row => ({ id: row.id, status: row.status, created_at: row.created_at,
    finished_at: row.finished_at, progress: row.progress, conversationId: row.conversationId,
    ...(row.status === 'completed' && typeof row.result === 'string' ? { result: row.result } : {}),
  }))
  return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } })
}
