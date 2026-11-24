// Fixer-facing side of QuickBooks changes: propose and look up. Nothing here writes to
// QuickBooks. A proposal is a row waiting for a human in qb_approvers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from '@/lib/notifications'
import { qbQuery } from '@/lib/integrations/quickbooks/readOnlyClient'
import { validateChange, summarize, lineTotal, type ValidChange } from './changeSchema'

const NAME = { customer: 'Customer', invoice: 'Invoice', estimate: 'Estimate' } as const
const MAX_PENDING = 50

type QBRecord = Record<string, unknown> & { Id: string; SyncToken?: string }

async function fetchOne(entity: ValidChange['entity'], id: string): Promise<QBRecord | null> {
  const rows = await qbQuery<QBRecord>(`SELECT * FROM ${NAME[entity]} WHERE Id = '${id}'`)
  return rows[0] ?? null
}

function label(entity: ValidChange['entity'], rec: QBRecord): string {
  if (entity === 'customer') return `"${rec.DisplayName as string}" (#${rec.Id})`
  const cust = (rec.CustomerRef as { name?: string } | undefined)?.name
  const total = typeof rec.TotalAmt === 'number' ? ` $${(rec.TotalAmt as number).toFixed(2)}` : ''
  return `#${(rec.DocNumber as string) || rec.Id}${cust ? ` (${cust}${total})` : ''}`
}

export interface ProposeResult { ok: boolean; data?: Record<string, unknown>; error?: string; problems?: string[] }

export async function proposeQuickBooksChange(
  admin: SupabaseClient,
  requestedBy: string,
  params: Record<string, unknown>,
  opts: { notify?: boolean } = {},
): Promise<ProposeResult> {
  const v = validateChange({
    entity: params.entity, action: params.action, entity_id: params.entity_id,
    data: params.data, send_to: params.send_to,
  })
  if (!v.ok) return { ok: false, error: 'The proposal was not valid. Fix these and try again.', problems: v.errors }
  const c = v.change

  const { count: pendingCount } = await admin.from('qb_change_requests')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if ((pendingCount ?? 0) >= MAX_PENDING) {
    return { ok: false, error: `There are already ${MAX_PENDING} changes waiting for approval. Ask the office to clear the queue first.` }
  }

  let before: QBRecord | null = null
  let customerName: string | null = null
  let beforeLabel: string | null = null

  try {
    // Existing record: read it live so the approver sees the real "before" and we pin its SyncToken.
    if (c.entityId) {
      before = await fetchOne(c.entity, c.entityId)
      if (!before) return { ok: false, error: `${NAME[c.entity]} #${c.entityId} was not found in QuickBooks.` }
      beforeLabel = label(c.entity, before)
      if (c.action === 'void' && Number((before as { TotalAmt?: number }).TotalAmt ?? 0) === 0) {
        return { ok: false, error: 'That invoice is already zero or voided.' }
      }
    }

    // Customer or parent the new record points at must exist and be active.
    const ref = (c.data.CustomerRef ?? c.data.ParentRef) as { value: string } | undefined
    if (ref) {
      const cust = await fetchOne('customer', ref.value)
      if (!cust) return { ok: false, error: `Customer #${ref.value} was not found in QuickBooks. Look it up first; do not guess IDs.` }
      if (cust.Active === false) return { ok: false, error: `Customer "${cust.DisplayName as string}" is inactive in QuickBooks.` }
      customerName = cust.DisplayName as string
    } else if (before && c.entity !== 'customer') {
      customerName = (before.CustomerRef as { name?: string } | undefined)?.name ?? null
    }

    // Every product/service on the lines must exist, so QuickBooks does not reject it after approval.
    if (Array.isArray(c.data.Line)) {
      const ids = new Set<string>()
      for (const l of c.data.Line as { SalesItemLineDetail?: { ItemRef?: { value: string } } }[]) {
        const i = l.SalesItemLineDetail?.ItemRef?.value
        if (i) ids.add(i)
      }
      if (ids.size) {
        const found = await qbQuery<{ Id: string }>(`SELECT Id FROM Item WHERE Id IN (${[...ids].map(i => `'${i}'`).join(',')}) MAXRESULTS 100`)
        const missing = [...ids].filter(i => !found.some(f => f.Id === i))
        if (missing.length) return { ok: false, error: `Product/service ID(s) not found in QuickBooks: ${missing.join(', ')}. Look up the items first.` }
      }
    }

    // New customer: refuse an exact duplicate name rather than let QuickBooks reject it later.
    if (c.action === 'create' && c.entity === 'customer' && typeof c.data.DisplayName === 'string') {
      try {
        const dup = await qbQuery<{ Id: string }>(`SELECT Id FROM Customer WHERE DisplayName = '${c.data.DisplayName.replace(/'/g, "\\'")}'`)
        if (dup.length) return { ok: false, error: `A customer named "${c.data.DisplayName}" already exists (#${dup[0].Id}). Use it instead of creating another.` }
      } catch { /* name tripped the read-only guard; QuickBooks will still refuse a duplicate */ }
    }
  } catch (e) {
    return { ok: false, error: `QuickBooks could not be read, so nothing was proposed: ${e instanceof Error ? e.message : 'unknown error'}` }
  }

  const payload = c.action === 'send' ? (c.sendTo ? { send_to: c.sendTo } : {}) : c.data
  const summary = summarize(c, { customerName, beforeLabel })

  // Same change already waiting? Return it instead of queueing a twin.
  const { data: dupes } = await admin.from('qb_change_requests').select('id, payload')
    .eq('status', 'pending').eq('entity', c.entity).eq('action', c.action)
    .filter('qb_entity_id', c.entityId ? 'eq' : 'is', c.entityId ?? null)
  const sig = JSON.stringify(payload)
  const twin = (dupes ?? []).find(d => JSON.stringify(d.payload) === sig)
  if (twin) return { ok: true, data: { request_id: twin.id, status: 'pending', summary, duplicate: true, message: 'That exact change is already waiting for approval.' } }

  const jobId = typeof params.job_id === 'string' && /^[0-9a-f-]{36}$/i.test(params.job_id) ? params.job_id : null
  const { data: row, error } = await admin.from('qb_change_requests').insert({
    entity: c.entity, action: c.action, qb_entity_id: c.entityId,
    sync_token: before?.SyncToken ?? null,
    payload, before: before ?? null, summary,
    reason: typeof params.reason === 'string' ? params.reason.slice(0, 1000) : null,
    requested_note: typeof params.requested_by_name === 'string' ? params.requested_by_name.slice(0, 120) : null,
    job_id: jobId, requested_by: requestedBy,
  }).select('id').single()
  if (error || !row) return { ok: false, error: `Could not save the proposal: ${error?.message ?? 'unknown error'}` }

  const { data: approvers } = opts.notify === false ? { data: [] } : await admin.from('qb_approvers').select('user_id')
  await notify({
    admin: admin as never, userIds: (approvers ?? []).map(a => a.user_id),
    type: 'qb_change_pending', title: 'QuickBooks change needs approval',
    body: summary, link: '/quickbooks-approvals',
  })

  return {
    ok: true,
    data: {
      request_id: row.id, status: 'pending', summary,
      total: c.data.Line ? lineTotal(c.data.Line) : undefined,
      message: 'Saved for approval. NOTHING has changed in QuickBooks. August, Lisa, Jason or Evelyn must approve it in BuildOS (QuickBooks approvals). Tell the person it is waiting; use list_quickbooks_change_requests to check the outcome.',
    },
  }
}

export async function listQuickBooksChangeRequests(
  admin: SupabaseClient,
  params: { request_id?: unknown; status?: unknown; limit?: unknown },
) {
  let q = admin.from('qb_change_requests')
    .select('id, entity, action, qb_entity_id, summary, status, error, result_qb_id, created_at, decided_at, expires_at')
    .order('created_at', { ascending: false })
  if (typeof params.request_id === 'string') q = q.eq('id', params.request_id)
  if (typeof params.status === 'string') q = q.eq('status', params.status)
  const n = Number(params.limit ?? 20)
  q = q.limit(Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 50) : 20)
  const { data, error } = await q
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, data: { requests: data ?? [] } }
}
