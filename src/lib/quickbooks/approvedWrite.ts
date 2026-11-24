// The ONLY place BuildOS writes to QuickBooks.
//
// It is not a general write client: it takes one qb_change_requests row that an approver has
// already claimed (status 'approving', decided_by set) and carries out exactly that change.
// The generic client in client.ts stays GET-only on purpose.

import type { SupabaseClient } from '@supabase/supabase-js'
import { baseUrl, loadTokens, refreshTokenIfNeeded, type QBTokens } from './client'

export interface ChangeRow {
  id: string
  entity: 'customer' | 'invoice' | 'estimate'
  action: 'create' | 'update' | 'delete' | 'void' | 'send' | 'deactivate'
  qb_entity_id: string | null
  sync_token: string | null
  payload: Record<string, unknown>
  status: string
  decided_by: string | null
}

const QB_NAME = { customer: 'Customer', invoice: 'Invoice', estimate: 'Estimate' } as const
const MINOR = 'minorversion=75'

async function call(tokens: QBTokens, method: 'GET' | 'POST', path: string, opts: { body?: unknown; octet?: boolean } = {}) {
  const url = `${baseUrl(tokens.realm_id)}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
      'Content-Type': opts.octet ? 'application/octet-stream' : 'application/json',
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* leave empty */ }
  if (!res.ok) {
    const fault = (json.Fault as { Error?: { Message?: string; Detail?: string }[] } | undefined)?.Error?.[0]
    throw new Error(`QuickBooks refused it (${res.status}): ${fault?.Detail || fault?.Message || text.slice(0, 300)}`)
  }
  return json
}

/**
 * Runs an approved change. Throws with a plain message on any problem. The caller records the
 * outcome; this function never retries (a retry of a write is a decision for a person).
 */
export async function executeApprovedChange(admin: SupabaseClient, row: ChangeRow): Promise<{ qbId: string | null; result: Record<string, unknown> }> {
  if (row.status !== 'approving' || !row.decided_by) throw new Error('Refusing to run: this request has not been approved')

  const tokens = await refreshTokenIfNeeded(admin, await loadTokens(admin))
  const name = QB_NAME[row.entity]
  const rid = `requestid=${encodeURIComponent(row.id)}`

  if (row.action === 'create') {
    const json = await call(tokens, 'POST', `/${row.entity}?${rid}&${MINOR}`, { body: row.payload })
    const created = json[name] as { Id?: string } | undefined
    return { qbId: created?.Id ?? null, result: { created } }
  }

  // Everything else targets an existing record. Read it fresh and refuse if it moved since the
  // approver saw it: approving a stale edit could overwrite someone's newer change.
  const id = row.qb_entity_id
  if (!id) throw new Error('No QuickBooks ID on this request')
  const current = (await call(tokens, 'GET', `/${row.entity}/${id}?${MINOR}`))[name] as { Id: string; SyncToken: string } | undefined
  if (!current) throw new Error(`${name} #${id} no longer exists in QuickBooks`)
  if (row.sync_token !== null && current.SyncToken !== row.sync_token) {
    throw new Error(`${name} #${id} was changed in QuickBooks after this was proposed. Nothing was sent. Ask Fixer to propose it again.`)
  }

  if (row.action === 'send') {
    const sendTo = typeof row.payload.send_to === 'string' ? `&sendTo=${encodeURIComponent(row.payload.send_to)}` : ''
    const json = await call(tokens, 'POST', `/${row.entity}/${id}/send?${rid}${sendTo}&${MINOR}`, { octet: true })
    return { qbId: id, result: { sent: json[name] } }
  }

  if (row.action === 'delete') {
    const json = await call(tokens, 'POST', `/${row.entity}?operation=delete&${rid}&${MINOR}`, { body: { Id: id, SyncToken: current.SyncToken } })
    return { qbId: id, result: { deleted: json[name] ?? json } }
  }

  if (row.action === 'void') {
    const json = await call(tokens, 'POST', `/invoice?operation=void&${rid}&${MINOR}`, { body: { Id: id, SyncToken: current.SyncToken, sparse: true } })
    return { qbId: id, result: { voided: json[name] } }
  }

  // update / deactivate: sparse update carries only the changed fields.
  const fields = row.action === 'deactivate' ? { Active: false } : row.payload
  const json = await call(tokens, 'POST', `/${row.entity}?${rid}&${MINOR}`, { body: { Id: id, SyncToken: current.SyncToken, sparse: true, ...fields } })
  return { qbId: id, result: { updated: json[name] } }
}
