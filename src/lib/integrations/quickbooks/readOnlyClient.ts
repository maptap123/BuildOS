// QuickBooks read-only query client.
// Only SELECT queries are permitted. All mutation keywords are rejected.
// Uses the existing token store and refresh logic from @/lib/quickbooks/client.

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshTokenIfNeeded, getQBClient } from '@/lib/quickbooks/client'
import type { QBTokens } from '@/lib/quickbooks/client'

// ─── Safety guard ─────────────────────────────────────────────────────────────

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|UPSERT)\b/i

function assertSelectOnly(query: string): void {
  if (FORBIDDEN_KEYWORDS.test(query)) {
    throw new Error(`Read-only QB client: mutation keywords are not allowed. Query: ${query.slice(0, 120)}`)
  }
  const trimmed = query.trimStart().toUpperCase()
  if (!trimmed.startsWith('SELECT')) {
    throw new Error(`Read-only QB client: only SELECT queries are permitted. Query: ${query.slice(0, 120)}`)
  }
}

// ─── Token loading ─────────────────────────────────────────────────────────────

async function loadTokens(): Promise<QBTokens> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('quickbooks_tokens')
    .select('id, org_id, realm_id, access_token, refresh_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) throw new Error('QuickBooks is not connected. No tokens found.')
  return data as QBTokens
}

// ─── Query execution ──────────────────────────────────────────────────────────

/**
 * Run a read-only QBO query.
 * Rejects any query containing mutation keywords or not starting with SELECT.
 */
export async function qbQuery<T = Record<string, unknown>>(
  query: string
): Promise<T[]> {
  assertSelectOnly(query)

  const admin = createAdminClient()
  const tokens = await loadTokens()
  const refreshed = await refreshTokenIfNeeded(admin, tokens)
  const { qbFetch } = getQBClient(refreshed)

  const url = `/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await qbFetch(url)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB query failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  // QBO wraps results: { QueryResponse: { Customer: [...], ... } }
  const qr = json?.QueryResponse ?? {}
  const entityKey = Object.keys(qr).find(k => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount')
  if (!entityKey) return []
  return (qr[entityKey] ?? []) as T[]
}

// ─── Named helpers ────────────────────────────────────────────────────────────

export interface QBCustomerResult {
  Id: string
  DisplayName: string
  CompanyName?: string
  GivenName?: string
  FamilyName?: string
  Job?: boolean
  ParentRef?: { value: string; name: string }
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  Active: boolean
  SyncToken: string
}

/**
 * Search QB customers by display name (case-insensitive LIKE).
 * Returns at most `limit` results (default 20).
 */
export async function searchQuickBooksCustomers(
  searchTerm: string,
  limit = 20
): Promise<QBCustomerResult[]> {
  const escaped = searchTerm.replace(/'/g, "\\'")
  const query = `SELECT * FROM Customer WHERE DisplayName LIKE '%${escaped}%' MAXRESULTS ${limit}`
  return qbQuery<QBCustomerResult>(query)
}

/**
 * Fetch a single QB customer by Id.
 */
export async function getQuickBooksCustomer(
  customerId: string
): Promise<QBCustomerResult | null> {
  const escaped = customerId.replace(/'/g, "\\'")
  const results = await qbQuery<QBCustomerResult>(
    `SELECT * FROM Customer WHERE Id = '${escaped}'`
  )
  return results[0] ?? null
}

// Re-export realmId helper for callers that need it
export { loadTokens as loadQBTokens }
