/**
 * QuickBooks → BuildOS client billing sync (read-only; QB is the source of truth).
 *
 * Mirrors what JDC bills and collects per job into `job_billing`:
 *  - Invoice / SalesReceipt / CreditMemo / RefundReceipt: one row each, on the job
 *    its header CustomerRef is linked to. Invoice.balance is QB's own open balance.
 *  - Payment: attributed to the job(s) of the invoices it pays (its own
 *    CustomerRef is usually the same job, but can be the parent client). Only
 *    money actually received counts: a $0 payment that just applies a credit memo
 *    to an invoice is skipped, because the credit memo already reduced the bill.
 *    Payment.balance holds the part not yet applied to any invoice (a deposit).
 *
 * Same two paths as costSync.ts: syncQuickBooksBilling (daily full pull) and
 * syncQuickBooksBillingTransactions (Intuit webhook, only what changed).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTokens, refreshTokenIfNeeded, getQBClient } from '@/lib/quickbooks/client'
import { fetchAll, loadJobMap, type TxnChange } from '@/lib/quickbooks/costSync'

const DOC_ENTITIES = ['Invoice', 'SalesReceipt', 'CreditMemo', 'RefundReceipt'] as const
export const BILLING_ENTITIES: readonly string[] = [...DOC_ENTITIES, 'Payment']

type Ref = { value: string; name?: string }
type QBDoc = {
  Id: string
  DocNumber?: string
  TxnDate: string
  DueDate?: string
  TotalAmt?: number
  Balance?: number
  RemainingCredit?: number
  CustomerRef?: Ref
  Line?: Array<{ Description?: string; DetailType: string; LinkedTxn?: Array<{ TxnId: string; TxnType: string }>; Amount?: number }>
}

type Row = {
  job_id: string
  qb_txn_type: string
  qb_txn_id: string
  qb_customer_id: string | null
  doc_number: string | null
  txn_date: string
  due_date: string | null
  amount: number
  balance: number | null
  description: string | null
  linked_invoice_ids: string[] | null
  updated_at: string
}

const keyOf = (r: Pick<Row, 'qb_txn_type' | 'qb_txn_id' | 'job_id'>) => `${r.qb_txn_type}|${r.qb_txn_id}|${r.job_id}`

function docRow(entity: string, d: QBDoc, jobMap: Map<string, string>): Row | null {
  const jobId = d.CustomerRef ? jobMap.get(d.CustomerRef.value) : undefined
  if (!jobId || !Number(d.TotalAmt)) return null
  const desc = (d.Line ?? []).map((l) => l.Description?.trim()).filter(Boolean).join(' · ')
  return {
    job_id: jobId,
    qb_txn_type: entity,
    qb_txn_id: d.Id,
    qb_customer_id: d.CustomerRef!.value,
    doc_number: d.DocNumber ?? null,
    txn_date: d.TxnDate,
    due_date: d.DueDate ?? null,
    amount: Math.abs(Number(d.TotalAmt)),
    balance: entity === 'Invoice' ? Number(d.Balance ?? 0) : entity === 'CreditMemo' ? Number(d.RemainingCredit ?? d.Balance ?? 0) : null,
    description: desc || null,
    linked_invoice_ids: null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Split one payment across the jobs of the invoices it pays. `invoiceJob` maps a
 * QB invoice id to its BuildOS job. Unapplied money stays on the payment's own
 * customer's job. Credit-memo-only applications carry no cash and are dropped.
 */
function paymentRows(p: QBDoc & { UnappliedAmt?: number }, jobMap: Map<string, string>, invoiceJob: Map<string, string>): Row[] {
  const cash = Number(p.TotalAmt ?? 0)
  if (!cash) return []

  const perJob = new Map<string, { amount: number; unapplied: number; invoices: string[] }>()
  const add = (jobId: string | undefined, amount: number, invoiceId?: string) => {
    if (!jobId || !amount) return
    const cur = perJob.get(jobId) ?? { amount: 0, unapplied: 0, invoices: [] }
    cur.amount += amount
    if (invoiceId) cur.invoices.push(invoiceId)
    else cur.unapplied += amount
    perJob.set(jobId, cur)
  }

  const ownJob = p.CustomerRef ? jobMap.get(p.CustomerRef.value) : undefined
  let applied = 0
  for (const line of p.Line ?? []) {
    const inv = line.LinkedTxn?.find((t) => t.TxnType === 'Invoice')
    if (!inv) continue
    add(invoiceJob.get(inv.TxnId) ?? ownJob, Number(line.Amount ?? 0), inv.TxnId)
    applied += Number(line.Amount ?? 0)
  }
  add(ownJob, Number(p.UnappliedAmt ?? 0))

  // Lines can exceed the cash when credit memos are applied in the same payment;
  // scale so a payment never counts for more than the money it brought in.
  const total = applied + Number(p.UnappliedAmt ?? 0)
  const scale = total > cash ? cash / total : 1

  return [...perJob.entries()].map(([jobId, v]) => ({
    job_id: jobId,
    qb_txn_type: 'Payment',
    qb_txn_id: p.Id,
    qb_customer_id: p.CustomerRef?.value ?? null,
    doc_number: p.DocNumber ?? null,
    txn_date: p.TxnDate,
    due_date: null,
    amount: Math.round(v.amount * scale * 100) / 100,
    balance: Math.round(v.unapplied * 100) / 100, // deposit received but not yet applied to an invoice
    description: null,
    linked_invoice_ids: v.invoices.length ? v.invoices : null,
    updated_at: new Date().toISOString(),
  }))
}

async function upsertRows(admin: SupabaseClient, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('job_billing').upsert(rows.slice(i, i + 500), { onConflict: 'qb_txn_type,qb_txn_id,job_id' })
    if (error) throw new Error(`Failed to save QuickBooks billing: ${error.message}`)
  }
}

export interface BillingSyncResult {
  documents: Record<string, number>
  rows: number
  jobsWithBilling: number
  deleted: number
}

export async function syncQuickBooksBilling(admin: SupabaseClient): Promise<BillingSyncResult> {
  const tokens = await refreshTokenIfNeeded(admin, await loadTokens(admin))
  const { qbFetch } = getQBClient(tokens)
  const jobMap = await loadJobMap(admin)

  const documents: Record<string, number> = {}
  const rows: Row[] = []
  const invoiceJob = new Map<string, string>()

  for (const entity of DOC_ENTITIES) {
    const docs = await fetchAll<QBDoc>(qbFetch, entity)
    documents[entity] = docs.length
    for (const d of docs) {
      if (entity === 'Invoice' && d.CustomerRef) {
        const j = jobMap.get(d.CustomerRef.value)
        if (j) invoiceJob.set(d.Id, j)
      }
      const r = docRow(entity, d, jobMap)
      if (r) rows.push(r)
    }
  }
  const payments = await fetchAll<QBDoc & { UnappliedAmt?: number }>(qbFetch, 'Payment')
  documents.Payment = payments.length
  for (const p of payments) rows.push(...paymentRows(p, jobMap, invoiceJob))

  const { count: existing } = await admin.from('job_billing').select('id', { count: 'exact', head: true })
  if (rows.length === 0 && (existing ?? 0) > 0) {
    throw new Error(`QuickBooks returned no billing but ${existing} rows are on file — aborting instead of deleting them`)
  }
  await upsertRows(admin, rows)

  // Remove rows for documents that were deleted, re-tagged, or no longer map to a linked job.
  const keep = new Set(rows.map(keyOf))
  const stale: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('job_billing').select('id, qb_txn_type, qb_txn_id, job_id').order('id').range(from, from + 999)
    if (error) throw new Error(`Failed to read billing: ${error.message}`)
    for (const r of data ?? []) if (!keep.has(keyOf(r))) stale.push(r.id)
    if ((data ?? []).length < 1000) break
  }
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await admin.from('job_billing').delete().in('id', stale.slice(i, i + 200))
    if (error) throw new Error(`Failed to remove stale billing: ${error.message}`)
  }

  return { documents, rows: rows.length, jobsWithBilling: new Set(rows.map((r) => r.job_id)).size, deleted: stale.length }
}

/** Webhook path: re-read only the billing documents QB says changed. */
export async function syncQuickBooksBillingTransactions(admin: SupabaseClient, changes: TxnChange[]): Promise<{ upserted: number; deleted: number }> {
  const relevant = changes.filter((c) => BILLING_ENTITIES.includes(c.entity))
  if (relevant.length === 0) return { upserted: 0, deleted: 0 }

  const tokens = await refreshTokenIfNeeded(admin, await loadTokens(admin))
  const { qbFetch } = getQBClient(tokens)
  const jobMap = await loadJobMap(admin)

  const read = async (entity: string, id: string): Promise<QBDoc | null> => {
    const res = await qbFetch(`/${entity.toLowerCase()}/${encodeURIComponent(id)}?minorversion=65`)
    if (res.ok) return (await res.json())[entity] as QBDoc
    if (res.status === 404 || res.status === 400) return null // gone since the notification
    throw new Error(`QB ${entity} ${id} read failed (${res.status}): ${await res.text()}`)
  }

  let upserted = 0, deleted = 0
  for (const c of relevant) {
    const doc = c.deleted ? null : await read(c.entity, c.id)
    let rows: Row[] = []
    if (doc && c.entity === 'Payment') {
      // Resolve each paid invoice's job: from what we already mirrored, else read the invoice.
      const invoiceJob = new Map<string, string>()
      for (const line of doc.Line ?? []) {
        const inv = line.LinkedTxn?.find((t) => t.TxnType === 'Invoice')
        if (!inv || invoiceJob.has(inv.TxnId)) continue
        const { data } = await admin.from('job_billing').select('job_id').eq('qb_txn_type', 'Invoice').eq('qb_txn_id', inv.TxnId).maybeSingle()
        const jobId = data?.job_id ?? (await read('Invoice', inv.TxnId))?.CustomerRef?.value
        const resolved = data?.job_id ?? (jobId ? jobMap.get(jobId) : undefined)
        if (resolved) invoiceJob.set(inv.TxnId, resolved)
      }
      rows = paymentRows(doc, jobMap, invoiceJob)
    } else if (doc) {
      const r = docRow(c.entity, doc, jobMap)
      if (r) rows = [r]
    }

    if (rows.length) {
      await upsertRows(admin, rows)
      upserted += rows.length
    }
    let del = admin.from('job_billing').delete({ count: 'exact' }).eq('qb_txn_type', c.entity).eq('qb_txn_id', c.id)
    if (rows.length) del = del.not('job_id', 'in', `(${rows.map((r) => r.job_id).join(',')})`)
    const { error, count } = await del
    if (error) throw new Error(`Failed to clear stale ${c.entity} ${c.id}: ${error.message}`)
    deleted += count ?? 0
  }
  return { upserted, deleted }
}
