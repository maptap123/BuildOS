import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
// TODO (Phase 4): import { QuickBooksClient } from '@/lib/quickbooks/client'
// TODO (Phase 4): import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/integrations/quickbooks/sync
 *
 * Manual sync trigger. Enqueues or immediately executes a QB sync for a
 * given entity type and ID.
 *
 * Request body:
 *   {
 *     entity: 'job' | 'bill' | 'invoice',
 *     id: string
 *   }
 *
 * Phase 4 implementation plan:
 *   1. Check that QB is connected (quickbooks_tokens row exists + not expired)
 *   2. Load entity from DB
 *   3. Dispatch to QuickBooksClient.syncJob() / syncBill() / syncInvoice()
 *   4. Store returned qb_id on the entity row
 *   5. Update integration_settings.last_sync_at
 *   6. On failure: write error to integration_settings.sync_error
 *
 * Future: replace direct call with a background job / Vercel cron for
 *   high-volume syncs and automatic retry on 429/503 from Intuit.
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
  const { entity, id } = body as { entity?: string; id?: string }

  if (!entity || !id) {
    return NextResponse.json({ error: 'entity and id required' }, { status: 400 })
  }

  const validEntities = ['job', 'bill', 'invoice'] as const
  if (!validEntities.includes(entity as typeof validEntities[number])) {
    return NextResponse.json(
      { error: `Invalid entity. Valid values: ${validEntities.join(', ')}` },
      { status: 400 }
    )
  }

  // TODO (Phase 4): check quickbooks_tokens for valid/refreshable token
  // TODO (Phase 4): call QuickBooksClient.syncJob/syncBill/syncInvoice
  return NextResponse.json(
    {
      error: 'QuickBooks sync not yet configured',
      note: 'Phase 4: Connect QuickBooks via Settings → Integrations, then this endpoint will sync the entity.',
      entity,
      id,
    },
    { status: 501 }
  )
}
