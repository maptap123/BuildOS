import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Lines Fixer priced, waiting on a human
 * ======================================
 * While the Estimate Builder's Fixer panel holds an open session (see
 * ./session/route.ts), add_estimate_lines stages here instead of writing to
 * estimate_lines. This is where the estimator reads them, keeps the ones that look
 * right, and throws the rest away. Nothing reaches the estimate without a POST here.
 */

type PermColumn = 'can_view' | 'can_create'

async function guard(column: PermColumn) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select(column)
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!(perm as Record<string, boolean> | null)?.[column]) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, admin }
}

// GET /api/estimate-lines/proposals?estimate_id=<uuid>  — pending, newest batch first
export async function GET(request: Request) {
  const g = await guard('can_view')
  if (g.error) return g.error

  const { searchParams } = new URL(request.url)
  const estimateId = searchParams.get('estimate_id')
  if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 })

  const { data, error } = await g.admin
    .from('estimate_line_proposals')
    .select('*')
    .eq('estimate_id', estimateId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/estimate-lines/proposals  { proposal_ids: string[] }  — approve onto the estimate
export async function POST(request: Request) {
  const g = await guard('can_create')
  if (g.error) return g.error
  const { admin, user } = g

  const body = await request.json().catch(() => ({})) as { proposal_ids?: string[] }
  const ids = (body.proposal_ids ?? []).filter(id => typeof id === 'string' && id)
  if (ids.length === 0) return NextResponse.json({ error: 'proposal_ids required' }, { status: 400 })

  const { data: proposals, error: readErr } = await admin
    .from('estimate_line_proposals')
    .select('*')
    .in('id', ids)
    .eq('status', 'pending')
    .order('sort_order')

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!proposals?.length) {
    return NextResponse.json({ error: 'No pending proposals matched' }, { status: 404 })
  }

  // A batch belongs to one estimate. Anything else means the caller mixed ids from two
  // screens, and the lead_id below would be wrong for half of them.
  const estimateIds = [...new Set(proposals.map(p => p.estimate_id as string))]
  if (estimateIds.length > 1) {
    return NextResponse.json({ error: 'Proposals span more than one estimate' }, { status: 400 })
  }

  // Fixer could not source these, and nobody has named them yet. Approving a blank
  // line would put an unnamed row on a client-facing estimate.
  const unnamed = proposals.filter(
    p => p.name_status === 'unsourced' || !String(p.description ?? '').trim()
  )
  if (unnamed.length > 0) {
    return NextResponse.json({
      error: `${unnamed.length} line${unnamed.length === 1 ? ' still needs' : 's still need'} a name and price`,
      unnamed_ids: unnamed.map(p => p.id),
    }, { status: 422 })
  }

  const { data: estimate, error: estErr } = await admin
    .from('estimates')
    .select('id, lead_id, is_locked')
    .eq('id', estimateIds[0])
    .single()
  if (estErr || !estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  if (estimate.is_locked) {
    return NextResponse.json({ error: 'Estimate is locked' }, { status: 409 })
  }

  // Re-derive sort order at approval time: the estimator may have added lines by hand
  // while the proposals sat waiting.
  const { data: lastLine } = await admin
    .from('estimate_lines')
    .select('sort_order')
    .eq('estimate_id', estimate.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const startOrder = Number((lastLine as { sort_order?: number } | null)?.sort_order ?? 0) + 1

  const { data: inserted, error: insErr } = await admin
    .from('estimate_lines')
    .insert(proposals.map((p, i) => ({
      estimate_id:  estimate.id,
      lead_id:      estimate.lead_id,
      description:  p.description,
      phase:        p.phase,
      cost_code:    p.cost_code,
      uom:          p.uom,
      quantity:      p.quantity,
      unit_cost:     p.unit_cost,
      labor_cost:    p.labor_cost,
      material_cost: p.material_cost,
      sub_cost:      p.sub_cost,
      markup_pct:    p.markup_pct,
      sort_order:   startOrder + i,
      source:         p.source,
      source_line_id: p.source_line_id,
      cost_item_id:   p.cost_item_id,
      comp_job_id:    p.comp_job_id,
      comp_label:     p.comp_label,
      ai_rationale:   p.ai_rationale,
    })))
    .select('*')

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const decidedAt = new Date().toISOString()
  await Promise.all((inserted ?? []).map((line, i) =>
    admin
      .from('estimate_line_proposals')
      .update({
        status: 'applied',
        applied_line_id: line.id,
        decided_by: user.id,
        decided_at: decidedAt,
      })
      .eq('id', proposals[i].id)
  ))

  return NextResponse.json(inserted ?? [], { status: 201 })
}

// PATCH /api/estimate-lines/proposals  { proposal_id, description, unit_cost, ... }
//
// The estimator filling in a line Fixer could not source. Naming it by hand is what
// makes it usable — the row stays marked ai_market so the estimate still records that
// it did not come from a past job.
export async function PATCH(request: Request) {
  const g = await guard('can_create')
  if (g.error) return g.error

  const body = await request.json().catch(() => ({})) as {
    proposal_id?: string
    description?: string
    unit_cost?: number
    quantity?: number
    uom?: string
    phase?: string
  }

  const id = body.proposal_id?.trim()
  if (!id) return NextResponse.json({ error: 'proposal_id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  const name = body.description?.trim()
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: 'description cannot be blank' }, { status: 400 })
    updates.description = name
    // A person typed it, so it is no longer an unnamed guess.
    updates.name_status = 'sourced'
  }
  if (body.unit_cost !== undefined) updates.unit_cost = Number(body.unit_cost) || 0
  if (body.quantity !== undefined) updates.quantity = Number(body.quantity) || 0
  if (body.uom !== undefined) updates.uom = body.uom.trim() || 'EA'
  if (body.phase !== undefined) updates.phase = body.phase.trim() || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await g.admin
    .from('estimate_line_proposals')
    .update(updates)
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/estimate-lines/proposals  — discard by id list or whole batch
export async function DELETE(request: Request) {
  const g = await guard('can_create')
  if (g.error) return g.error
  const { admin, user } = g

  const { searchParams } = new URL(request.url)
  const body = await request.json().catch(() => ({})) as {
    proposal_ids?: string[]
    batch_id?: string
    estimate_id?: string
  }

  const batchId = body.batch_id ?? searchParams.get('batch_id') ?? undefined
  const estimateId = body.estimate_id ?? searchParams.get('estimate_id') ?? undefined
  const ids = (body.proposal_ids ?? []).filter(id => typeof id === 'string' && id)

  let query = admin
    .from('estimate_line_proposals')
    .update({ status: 'discarded', decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('status', 'pending')

  if (ids.length > 0)        query = query.in('id', ids)
  else if (batchId)          query = query.eq('batch_id', batchId)
  else if (estimateId)       query = query.eq('estimate_id', estimateId)
  else return NextResponse.json({ error: 'proposal_ids, batch_id or estimate_id required' }, { status: 400 })

  const { data, error } = await query.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ discarded: data?.length ?? 0 })
}
