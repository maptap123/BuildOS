import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * The review window
 * =================
 * The Estimate Builder's Fixer panel opens one of these immediately before each turn.
 * While it is open, add_estimate_lines stages its rows for approval instead of writing
 * them onto the estimate (see /api/agent, case 'add_estimate_lines').
 *
 * It is keyed on the estimate, not the user, because the gateway calls /api/agent as
 * the shared Hermes service account — there is no estimator identity on the tool call
 * to match against. It expires on its own so a turn that dies mid-flight cannot leave
 * a trap that quietly diverts a later SMS-driven write into a queue nobody is watching.
 */

/** Long enough for a slow estimating turn, short enough to be forgotten safely. */
const SESSION_TTL_MS = 10 * 60 * 1000

async function guard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!perm?.can_create) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, admin }
}

// POST /api/estimate-lines/proposals/session  { estimate_id }  — open or extend
export async function POST(request: Request) {
  const g = await guard()
  if (g.error) return g.error

  const body = await request.json().catch(() => ({})) as { estimate_id?: string }
  const estimateId = body.estimate_id?.trim()
  if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 })

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const { error } = await g.admin
    .from('estimate_proposal_sessions')
    .upsert({
      estimate_id:  estimateId,
      requested_by: g.user.id,
      expires_at:   expiresAt,
      updated_at:   new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimate_id: estimateId, expires_at: expiresAt })
}

// DELETE /api/estimate-lines/proposals/session?estimate_id=<uuid>  — close early
export async function DELETE(request: Request) {
  const g = await guard()
  if (g.error) return g.error

  const { searchParams } = new URL(request.url)
  const estimateId = searchParams.get('estimate_id')
  if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 })

  const { error } = await g.admin
    .from('estimate_proposal_sessions')
    .delete()
    .eq('estimate_id', estimateId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
