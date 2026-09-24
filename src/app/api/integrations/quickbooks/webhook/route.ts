import { after, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncQuickBooksTransactions, type TxnChange } from '@/lib/quickbooks/costSync'

export const maxDuration = 60

/**
 * POST /api/integrations/quickbooks/webhook
 *
 * Intuit calls this within seconds of a Bill / Purchase / VendorCredit being
 * created, edited, voided or deleted in QuickBooks (configured in the Intuit
 * developer portal → app → Webhooks, Production). We verify the signature,
 * answer 200 immediately (Intuit retries slow or failed deliveries), then re-read
 * just the changed transactions from QB into `actuals`. Read-only toward QB.
 *
 * Accepts both payload formats Intuit sends:
 *  - classic:     { eventNotifications: [{ realmId, dataChangeEvent: { entities: [{ name, id, operation }] } }] }
 *  - CloudEvents: [{ type: "qbo.bill.updated.v1", intuitentityid, intuitaccountid }]
 *
 * Required env: QB_WEBHOOK_VERIFIER_TOKEN (Intuit portal → Webhooks → verifier token).
 */
export async function POST(request: Request) {
  const verifier = process.env.QB_WEBHOOK_VERIFIER_TOKEN
  if (!verifier) return NextResponse.json({ error: 'Webhook verifier token not configured' }, { status: 500 })

  const raw = await request.text()
  const signature = request.headers.get('intuit-signature') ?? ''
  const expected = createHmac('sha256', verifier).update(raw).digest('base64')
  const a = Buffer.from(signature), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let changes: Array<TxnChange & { realmId: string | null }>
  try {
    changes = parseChanges(JSON.parse(raw))
  } catch {
    return NextResponse.json({ error: 'Unparseable payload' }, { status: 400 })
  }

  after(async () => {
    const admin = createAdminClient()
    const { data: qb } = await admin.from('integration_settings').select('realm_id').eq('service', 'quickbooks').maybeSingle()
    const mine = changes.filter((c) => !c.realmId || c.realmId === qb?.realm_id)
    try {
      await syncQuickBooksTransactions(admin, mine)
    } catch (err) {
      // The daily full pull will reconcile anything missed here.
      const message = err instanceof Error ? err.message : String(err)
      await admin.from('integration_settings').update({ sync_error: `Webhook: ${message}` }).eq('service', 'quickbooks')
    }
  })

  return NextResponse.json({ ok: true, received: changes.length })
}

function parseChanges(body: unknown): Array<TxnChange & { realmId: string | null }> {
  const out: Array<TxnChange & { realmId: string | null }> = []

  // CloudEvents: an array of events, type "qbo.<entity>.<created|updated|deleted|voided|merged>.v1"
  if (Array.isArray(body)) {
    for (const e of body as Array<Record<string, string>>) {
      const [, entity, op] = (e.type ?? '').split('.')
      if (!entity || !e.intuitentityid) continue
      out.push({
        entity: entity.charAt(0).toUpperCase() + entity.slice(1).replace(/credit$/i, 'Credit'), // bill → Bill, vendorcredit → VendorCredit
        id: String(e.intuitentityid),
        deleted: op === 'deleted',
        realmId: e.intuitaccountid ?? null,
      })
    }
    return out
  }

  // Classic format
  const notes = (body as { eventNotifications?: Array<{ realmId?: string; dataChangeEvent?: { entities?: Array<{ name: string; id: string; operation: string }> } }> }).eventNotifications ?? []
  for (const n of notes) {
    for (const e of n.dataChangeEvent?.entities ?? []) {
      out.push({ entity: e.name, id: String(e.id), deleted: e.operation === 'Delete', realmId: n.realmId ?? null })
    }
  }
  return out
}
