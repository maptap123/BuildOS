import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncQuickBooksCosts } from '@/lib/quickbooks/costSync'
import { NextResponse } from 'next/server'

// A full pull is a few dozen QB calls plus a few thousand upserts.
export const maxDuration = 300

/**
 * GET  /api/integrations/quickbooks/costs — Vercel cron (see vercel.json), daily.
 * POST /api/integrations/quickbooks/costs — manual "pull costs now", budget editors only.
 *
 * Pulls job costs (bills, checks/card expenses, vendor credits) from QuickBooks
 * into `actuals`. See src/lib/quickbooks/costSync.ts.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return run()
}

async function run() {
  const admin = createAdminClient()
  try {
    return NextResponse.json({ ok: true, ...(await syncQuickBooksCosts(admin)) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('integration_settings').update({ sync_error: `Cost sync: ${message}` }).eq('service', 'quickbooks')
    const notConnected = message.includes('not connected')
    return NextResponse.json({ error: message, setup_required: notConnected || undefined }, { status: notConnected ? 422 : 500 })
  }
}
