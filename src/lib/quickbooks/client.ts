/**
 * QuickBooks Online API Client
 *
 * Required environment variables:
 *   QB_CLIENT_ID          — from developer.intuit.com
 *   QB_CLIENT_SECRET      — from developer.intuit.com
 *   QB_REDIRECT_URI       — e.g. https://app.jdcplatform.com/api/integrations/quickbooks/callback
 *   QB_ENVIRONMENT        — 'sandbox' | 'production'
 *
 * Reference: https://developer.intuit.com/app/developer/qbo/docs/develop
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QBTokens {
  id: string
  org_id: string
  realm_id: string
  access_token: string
  refresh_token: string
  expires_at: string
}

export interface QBSyncResult {
  ok: boolean
  qb_id?: string
  message?: string
}

interface QBCustomerPayload {
  DisplayName: string
  CompanyName?: string
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  Job?: boolean
  ParentRef?: { value: string }
  SyncToken?: string
  Id?: string
}

interface QBEstimateLine {
  DetailType: 'SalesItemLineDetail'
  Amount: number
  Description?: string
  SalesItemLineDetail: {
    Qty?: number
    UnitPrice?: number
    ItemRef?: { value: string; name: string }
  }
}

interface QBBillLine {
  DetailType: 'AccountBasedExpenseLineDetail'
  Amount: number
  Description?: string
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string; name: string }
  }
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

function baseUrl(realmId: string): string {
  const env = process.env.QB_ENVIRONMENT
  const host =
    env === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com'
  return `${host}/v3/company/${realmId}`
}

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// ─── Token refresh ───────────────────────────────────────────────────────────

/**
 * POST to Intuit token endpoint using Basic auth, return new token data.
 * Retries once on 429.
 */
async function callTokenEndpoint(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const clientId = process.env.QB_CLIENT_ID!
  const clientSecret = process.env.QB_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const attempt = async () =>
    fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    })

  let res = await attempt()

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1000))
    res = await attempt()
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB token refresh failed (${res.status}): ${text}`)
  }

  return res.json()
}

/**
 * Refreshes the QB access token if it expires within 5 minutes.
 * Writes the updated token back to `quickbooks_tokens` via the admin client.
 * Returns the (possibly refreshed) token record.
 */
export async function refreshTokenIfNeeded(
  admin: SupabaseClient,
  tokens: QBTokens
): Promise<QBTokens> {
  const expiresAt = new Date(tokens.expires_at)
  const fiveMinutes = 5 * 60 * 1000

  if (expiresAt.getTime() - Date.now() > fiveMinutes) {
    return tokens
  }

  const refreshed = await callTokenEndpoint(tokens.refresh_token)
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  const updated: QBTokens = {
    ...tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: newExpiresAt,
  }

  await admin
    .from('quickbooks_tokens')
    .update({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      expires_at: updated.expires_at,
    })
    .eq('id', tokens.id)

  return updated
}

// ─── Authenticated fetch helper ───────────────────────────────────────────────

/**
 * Returns a fetch wrapper pre-configured with QB auth headers.
 * Retries once on 429.
 */
export function getQBClient(tokens: QBTokens) {
  const realmId = tokens.realm_id

  const qbFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const url = path.startsWith('http') ? path : `${baseUrl(realmId)}${path}`
    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    }

    const attempt = () => fetch(url, { ...init, headers })
    let res = await attempt()

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000))
      res = await attempt()
    }

    return res
  }

  return { qbFetch, realmId }
}

// ─── Job → QB Customer ───────────────────────────────────────────────────────

/**
 * Creates or updates a QB Customer for the given job.
 * Updates `jobs.qb_customer_id` and `jobs.qb_sync_status` on success.
 * Returns the QB Customer Id.
 */
export async function syncJobAsCustomer(
  admin: SupabaseClient,
  jobId: string
): Promise<string> {
  const tokens = await loadTokens(admin)
  const refreshed = await refreshTokenIfNeeded(admin, tokens)
  const { qbFetch, realmId } = getQBClient(refreshed)

  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .select('id, name, client_name, client_email, client_phone, qb_customer_id')
    .eq('id', jobId)
    .single()

  if (jobErr || !job) throw new Error(`Job not found: ${jobId}`)

  const payload: QBCustomerPayload = buildCustomerPayload(job)

  let qbId: string

  if (job.qb_customer_id) {
    // Fetch current SyncToken before updating
    const getRes = await qbFetch(`/customer/${job.qb_customer_id}`)
    if (!getRes.ok) {
      const text = await getRes.text()
      throw new Error(`QB GET customer failed (${getRes.status}): ${text}`)
    }
    const existing = await getRes.json()
    const syncToken: string = existing.Customer?.SyncToken ?? '0'

    payload.Id = job.qb_customer_id
    payload.SyncToken = syncToken

    const updateRes = await qbFetch(`/customer`, {
      method: 'POST',
      body: JSON.stringify({ sparse: true, ...payload }),
    })
    const updateData = await assertQBResponse(updateRes, 'Customer')
    qbId = updateData.Customer.Id
  } else {
    const createRes = await qbFetch(`/customer`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const createData = await assertQBResponse(createRes, 'Customer')
    qbId = createData.Customer.Id
  }

  await admin
    .from('jobs')
    .update({
      qb_customer_id: qbId,
      qb_sync_status: 'synced',
      qb_last_synced_at: new Date().toISOString(),
      qb_sync_error: null,
    })
    .eq('id', jobId)

  await updateLastSync(admin, realmId)
  return qbId
}

function buildCustomerPayload(job: {
  name: string
  client_name: string
  client_email: string | null
  client_phone: string | null
}): QBCustomerPayload {
  const payload: QBCustomerPayload = {
    DisplayName: job.name,
    CompanyName: job.client_name,
  }
  if (job.client_email) {
    payload.PrimaryEmailAddr = { Address: job.client_email }
  }
  if (job.client_phone) {
    payload.PrimaryPhone = { FreeFormNumber: job.client_phone }
  }
  return payload
}

// ─── Estimate → QB Estimate ──────────────────────────────────────────────────

/**
 * Creates a QB Estimate from a JDC estimate and its lines.
 * Requires the job to already have a qb_customer_id.
 */
export async function syncEstimateToQB(
  admin: SupabaseClient,
  jobId: string,
  estimateId: string
): Promise<string> {
  const tokens = await loadTokens(admin)
  const refreshed = await refreshTokenIfNeeded(admin, tokens)
  const { qbFetch } = getQBClient(refreshed)

  const { data: job } = await admin
    .from('jobs')
    .select('qb_customer_id, name')
    .eq('id', jobId)
    .single()

  if (!job?.qb_customer_id) {
    throw new Error('Job must be synced to QB (qb_customer_id required) before syncing estimates')
  }

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, title, status')
    .eq('id', estimateId)
    .single()

  if (!estimate) throw new Error(`Estimate not found: ${estimateId}`)

  const { data: lines } = await admin
    .from('estimate_lines')
    .select('description, quantity, unit_cost, markup_pct')
    .eq('estimate_id', estimateId)

  const qbLines: QBEstimateLine[] = (lines ?? []).map(line => {
    const markup = 1 + (line.markup_pct ?? 0) / 100
    const unitPrice = (line.unit_cost ?? 0) * markup
    const qty = line.quantity ?? 1
    return {
      DetailType: 'SalesItemLineDetail',
      Amount: parseFloat((unitPrice * qty).toFixed(2)),
      Description: line.description,
      SalesItemLineDetail: {
        Qty: qty,
        UnitPrice: parseFloat(unitPrice.toFixed(2)),
        ItemRef: { value: '1', name: 'Services' },
      },
    }
  })

  const payload = {
    CustomerRef: { value: job.qb_customer_id },
    Line: qbLines,
    DocNumber: estimateId.slice(0, 21),
  }

  const res = await qbFetch('/estimate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await assertQBResponse(res, 'Estimate')
  return data.Estimate.Id
}

// ─── Actual → QB Bill ────────────────────────────────────────────────────────

/**
 * Creates a QB Bill from a JDC actual expense entry.
 * Updates actuals.qb_bill_id and actuals.qb_synced on success.
 */
export async function syncActualAsBill(
  admin: SupabaseClient,
  actualId: string
): Promise<string> {
  const tokens = await loadTokens(admin)
  const refreshed = await refreshTokenIfNeeded(admin, tokens)
  const { qbFetch } = getQBClient(refreshed)

  const { data: actual, error: actualErr } = await admin
    .from('actuals')
    .select('id, job_id, amount, vendor_name, description, incurred_date, qb_vendor_id')
    .eq('id', actualId)
    .single()

  if (actualErr || !actual) throw new Error(`Actual not found: ${actualId}`)

  const billLines: QBBillLine[] = [
    {
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: actual.amount,
      Description: actual.description,
      AccountBasedExpenseLineDetail: {
        // Default to "Job Expenses" account — QB will reject if account doesn't exist
        AccountRef: { value: '1', name: 'Job Expenses' },
      },
    },
  ]

  const payload: Record<string, unknown> = {
    Line: billLines,
    TxnDate: actual.incurred_date,
  }

  if (actual.qb_vendor_id) {
    payload.VendorRef = { value: actual.qb_vendor_id }
  } else if (actual.vendor_name) {
    payload.VendorRef = { value: '0', name: actual.vendor_name }
  }

  const res = await qbFetch('/bill', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await assertQBResponse(res, 'Bill')
  const qbBillId: string = data.Bill.Id

  await admin
    .from('actuals')
    .update({ qb_bill_id: qbBillId, qb_synced: true })
    .eq('id', actualId)

  return qbBillId
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadTokens(admin: SupabaseClient): Promise<QBTokens> {
  const { data, error } = await admin
    .from('quickbooks_tokens')
    .select('id, org_id, realm_id, access_token, refresh_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error('QuickBooks is not connected. No tokens found.')
  }
  return data as QBTokens
}

async function assertQBResponse(
  res: Response,
  entity: string
): Promise<Record<string, Record<string, string>>> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB ${entity} API error (${res.status}): ${text}`)
  }
  return res.json()
}

async function updateLastSync(admin: SupabaseClient, realmId: string): Promise<void> {
  await admin
    .from('integration_settings')
    .update({ last_sync_at: new Date().toISOString(), sync_error: null })
    .eq('service', 'quickbooks')
    .eq('realm_id', realmId)
}
