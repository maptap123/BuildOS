/**
 * QuickBooks Online API Client — READ ONLY.
 *
 * QuickBooks is JDC's source of truth. BuildOS pulls from it (job costs, customer
 * matching) and never writes to it: qbFetch refuses anything but GET, and there
 * are no create/update helpers here. The OAuth scope Intuit offers
 * (com.intuit.quickbooks.accounting) can't be narrowed to read-only, so this
 * file is where that rule is enforced.
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
const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const SCOPE = 'com.intuit.quickbooks.accounting'

// ─── OAuth 2.0 authorization-code flow ────────────────────────────────────────

/**
 * Builds the Intuit authorization URL the user is redirected to in order to
 * grant BuildOS access to their QuickBooks company. `state` should be a
 * random value the caller stores (e.g. an httpOnly cookie) and verifies on
 * the callback, to prevent CSRF.
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID!,
    redirect_uri: process.env.QB_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPE,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface QBExchangeResult {
  access_token: string
  refresh_token: string
  expires_at: string
}

/**
 * Exchanges the authorization `code` Intuit sent to the callback for an
 * access/refresh token pair.
 */
export async function exchangeCodeForTokens(code: string): Promise<QBExchangeResult> {
  const clientId = process.env.QB_CLIENT_ID!
  const clientSecret = process.env.QB_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QB_REDIRECT_URI!,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB token exchange failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}

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

  // Intuit rotates the refresh token on every refresh; losing the new one
  // disconnects QuickBooks, so a failed write must not pass silently.
  const { error } = await admin
    .from('quickbooks_tokens')
    .update({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      expires_at: updated.expires_at,
    })
    .eq('id', tokens.id)
  if (error) throw new Error(`Failed to save refreshed QuickBooks token: ${error.message}`)

  return updated
}

// ─── Authenticated fetch helper ───────────────────────────────────────────────

/**
 * Returns a GET-only fetch wrapper pre-configured with QB auth headers.
 * Retries once on 429. Any other method throws — BuildOS never writes to QB.
 */
export function getQBClient(tokens: QBTokens) {
  const realmId = tokens.realm_id

  const qbFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      throw new Error(`QuickBooks is read-only from BuildOS (QB is the source of truth); refused ${method} ${path}`)
    }
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function loadTokens(admin: SupabaseClient): Promise<QBTokens> {
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
