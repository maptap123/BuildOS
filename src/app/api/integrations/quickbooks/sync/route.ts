import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import {
  syncJobAsCustomer,
  syncEstimateToQB,
  syncActualAsBill,
} from '@/lib/quickbooks/client'

/**
 * POST /api/integrations/quickbooks/sync
 *
 * Manual sync trigger. Immediately executes a QB sync for a given entity.
 *
 * Request body:
 *   { entity: 'job' | 'estimate' | 'bill', id: string, jobId?: string }
 *
 * For entity='estimate': jobId is required.
 *
 * Required env vars:
 *   QB_CLIENT_ID, QB_CLIENT_SECRET, QB_ENVIRONMENT, QB_REDIRECT_URI
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: budgetPerm } = await supabase
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!budgetPerm?.can_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { entity, id, jobId } = body as { entity?: string; id?: string; jobId?: string }

  if (!entity || !id) {
    return NextResponse.json({ error: 'entity and id are required' }, { status: 400 })
  }

  const validEntities = ['job', 'estimate', 'bill'] as const
  type ValidEntity = typeof validEntities[number]
  if (!validEntities.includes(entity as ValidEntity)) {
    return NextResponse.json(
      { error: `Invalid entity. Valid values: ${validEntities.join(', ')}` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Mark job as pending if applicable
  const targetJobId = entity === 'job' ? id : (jobId ?? null)
  if (targetJobId) {
    await admin
      .from('jobs')
      .update({ qb_sync_status: 'pending' })
      .eq('id', targetJobId)
  }

  try {
    let qbId: string

    if (entity === 'job') {
      qbId = await syncJobAsCustomer(admin, id)
    } else if (entity === 'estimate') {
      if (!jobId) {
        return NextResponse.json(
          { error: 'jobId is required when entity is estimate' },
          { status: 400 }
        )
      }
      qbId = await syncEstimateToQB(admin, jobId, id)
    } else {
      // bill
      qbId = await syncActualAsBill(admin, id)
    }

    return NextResponse.json({ ok: true, qb_id: qbId, entity, id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    // Record error on the job row when syncing a job
    if (targetJobId) {
      await admin
        .from('jobs')
        .update({ qb_sync_status: 'error', qb_sync_error: message })
        .eq('id', targetJobId)
    }

    // Surface QB-not-connected errors with a distinct status
    if (message.includes('not connected') || message.includes('No tokens')) {
      return NextResponse.json(
        { error: message, setup_required: true },
        { status: 422 }
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
