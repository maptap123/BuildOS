/**
 * QuickBooks → BuildOS job cost sync.
 *
 * JDC enters job costs in QuickBooks: bills, checks / card expenses (Purchase)
 * and vendor credits, with every line tagged to a customer or sub-customer
 * (the job), an item (the cost code, e.g. "23 Flr Cover SI") and a class
 * (Labor / Material / Subcontractor). This pulls every such line tagged to a
 * QB customer that is linked to a BuildOS job and writes one `actuals` row per
 * line, keyed by (qb_txn_type, qb_txn_id, qb_line_id).
 *
 * Every run is a full pull, not incremental: it's a few dozen API calls, and it
 * means edits, re-tagged lines and deleted transactions in QuickBooks all flow
 * through without change tracking. QB-sourced rows that no longer match a
 * current line are deleted; actuals entered in BuildOS (qb_txn_id NULL) are
 * never touched.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTokens, refreshTokenIfNeeded, getQBClient } from '@/lib/quickbooks/client'

const ENTITIES = ['Bill', 'Purchase', 'VendorCredit'] as const
type Entity = typeof ENTITIES[number]
const PAGE = 1000

type Ref = { value: string; name?: string }
type QBLine = {
  Id?: string
  Amount?: number
  Description?: string
  DetailType: string
  [detail: string]: unknown
}
type QBTxn = {
  Id: string
  DocNumber?: string
  TxnDate: string
  TotalAmt?: number
  Balance?: number
  Credit?: boolean            // Purchase: true = refund / credit card credit
  PaymentType?: string        // Purchase: Cash | Check | CreditCard
  VendorRef?: Ref
  EntityRef?: Ref
  Line?: QBLine[]
}
type LineDetail = { CustomerRef?: Ref; ItemRef?: Ref; AccountRef?: Ref; ClassRef?: Ref }

export interface CostSyncResult {
  transactions: Record<Entity, number>
  linesTaggedToLinkedJobs: number
  jobsWithCosts: number
  upserted: number
  deleted: number
  totalAmount: number
}

const PAYMENT_METHOD: Record<string, string> = { Cash: 'cash', Check: 'check', CreditCard: 'credit_card' }

async function fetchAll(qbFetch: (path: string) => Promise<Response>, entity: Entity): Promise<QBTxn[]> {
  const out: QBTxn[] = []
  for (let start = 1; ; start += PAGE) {
    const q = `SELECT * FROM ${entity} STARTPOSITION ${start} MAXRESULTS ${PAGE}`
    const res = await qbFetch(`/query?query=${encodeURIComponent(q)}&minorversion=65`)
    if (!res.ok) throw new Error(`QB ${entity} query failed (${res.status}): ${await res.text()}`)
    const rows = ((await res.json()).QueryResponse?.[entity] ?? []) as QBTxn[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** QB customer id → BuildOS job id, from jobs.qb_customer_id plus every linked job_external_links row. */
async function loadJobMap(admin: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data: jobs, error: jobsErr } = await admin.from('jobs').select('id, qb_customer_id').not('qb_customer_id', 'is', null)
  if (jobsErr) throw new Error(`Failed to load jobs: ${jobsErr.message}`)
  for (const j of jobs ?? []) map.set(j.qb_customer_id as string, j.id as string)

  const { data: links, error: linksErr } = await admin
    .from('job_external_links')
    .select('job_id, external_id')
    .eq('provider', 'quickbooks')
    .eq('status', 'linked')
  if (linksErr) throw new Error(`Failed to load QB job links: ${linksErr.message}`)
  for (const l of links ?? []) if (!map.has(l.external_id)) map.set(l.external_id, l.job_id)
  return map
}

/** created_by is required; attribute synced costs to the migration/system user, else whoever connected QB. */
async function systemUserId(admin: SupabaseClient): Promise<string> {
  const { data: sys } = await admin.from('users').select('id').eq('email', 'migration@jdc-platform.internal').maybeSingle()
  if (sys?.id) return sys.id
  const { data: qb } = await admin.from('integration_settings').select('connected_by').eq('service', 'quickbooks').maybeSingle()
  if (qb?.connected_by) return qb.connected_by
  throw new Error('No user to attribute QuickBooks costs to (migration user missing and QB connected_by empty)')
}

function key(type: string, txnId: string, lineId: string) {
  return `${type}|${txnId}|${lineId}`
}

export async function syncQuickBooksCosts(admin: SupabaseClient): Promise<CostSyncResult> {
  const tokens = await refreshTokenIfNeeded(admin, await loadTokens(admin))
  const { qbFetch } = getQBClient(tokens)
  const [jobMap, createdBy] = await Promise.all([loadJobMap(admin), systemUserId(admin)])

  const transactions = {} as Record<Entity, number>
  const rows: Record<string, unknown>[] = []

  for (const entity of ENTITIES) {
    const txns = await fetchAll(qbFetch, entity)
    transactions[entity] = txns.length

    for (const t of txns) {
      // Vendor credits and Purchase refunds reduce job cost.
      const sign = entity === 'VendorCredit' || (entity === 'Purchase' && t.Credit) ? -1 : 1
      const status = entity === 'Bill' && Number(t.Balance ?? 0) > 0 ? 'approved' : 'paid'

      for (const line of t.Line ?? []) {
        const d = (line[line.DetailType] ?? {}) as LineDetail
        const jobId = d.CustomerRef ? jobMap.get(d.CustomerRef.value) : undefined
        if (!jobId || !line.Id || !line.Amount) continue

        const item = d.ItemRef?.name ?? d.AccountRef?.name ?? null
        rows.push({
          job_id: jobId,
          qb_txn_type: entity,
          qb_txn_id: t.Id,
          qb_line_id: line.Id,
          qb_customer_id: d.CustomerRef!.value,
          qb_item_name: item,
          cost_class: d.ClassRef?.name ?? null,
          qb_bill_id: entity === 'Bill' ? t.Id : null,
          qb_vendor_id: (t.VendorRef ?? t.EntityRef)?.value ?? null,
          qb_synced: true, // sourced from QB
          vendor_name: (t.VendorRef ?? t.EntityRef)?.name ?? null,
          invoice_number: t.DocNumber ?? null,
          description: line.Description?.trim() || item || `QuickBooks ${entity}`,
          amount: sign * Number(line.Amount),
          status,
          incurred_date: t.TxnDate,
          payment_method: entity === 'Purchase' ? (PAYMENT_METHOD[t.PaymentType ?? ''] ?? 'other') : null,
          created_by: createdBy,
        })
      }
    }
  }

  // Safety stop: an empty pull against a book that already produced costs is an
  // API/auth failure, not a company that deleted every bill. Don't wipe on it.
  const { count: existingCount } = await admin.from('actuals').select('id', { count: 'exact', head: true }).not('qb_txn_id', 'is', null)
  if (rows.length === 0 && (existingCount ?? 0) > 0) {
    throw new Error(`QuickBooks returned no job costs but ${existingCount} are on file — aborting instead of deleting them`)
  }

  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await admin.from('actuals').upsert(chunk, { onConflict: 'qb_txn_type,qb_txn_id,qb_line_id' })
    if (error) throw new Error(`Failed to save QuickBooks costs: ${error.message}`)
    upserted += chunk.length
  }

  // Delete QB-sourced rows that no longer correspond to a tagged, linked line.
  const keep = new Set(rows.map((r) => key(r.qb_txn_type as string, r.qb_txn_id as string, r.qb_line_id as string)))
  const stale: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('actuals')
      .select('id, qb_txn_type, qb_txn_id, qb_line_id')
      .not('qb_txn_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to read synced costs: ${error.message}`)
    for (const a of data ?? []) if (!keep.has(key(a.qb_txn_type, a.qb_txn_id, a.qb_line_id))) stale.push(a.id)
    if ((data ?? []).length < PAGE) break
  }
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await admin.from('actuals').delete().in('id', stale.slice(i, i + 200))
    if (error) throw new Error(`Failed to remove stale QuickBooks costs: ${error.message}`)
  }

  await admin
    .from('integration_settings')
    .update({ last_sync_at: new Date().toISOString(), sync_error: null })
    .eq('service', 'quickbooks')

  return {
    transactions,
    linesTaggedToLinkedJobs: rows.length,
    jobsWithCosts: new Set(rows.map((r) => r.job_id)).size,
    upserted,
    deleted: stale.length,
    totalAmount: Math.round(rows.reduce((s, r) => s + (r.amount as number), 0) * 100) / 100,
  }
}
