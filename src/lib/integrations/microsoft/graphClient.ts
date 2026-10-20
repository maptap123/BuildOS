// Microsoft Graph app-only auth, shared by the SharePoint and Outlook mail clients.
// Required env vars:
//   MICROSOFT_TENANT_ID     — Azure AD tenant ID
//   MICROSOFT_CLIENT_ID     — App registration client ID
//   MICROSOFT_CLIENT_SECRET — App registration client secret
// Each feature needs its own application permission granted on the app
// (Sites.Read.All for SharePoint, Mail.Read for lead email sync).

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ─── App-only token ───────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null

export function isGraphConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
}

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value
  }

  const tenantId     = process.env.MICROSOFT_TENANT_ID
  const clientId     = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph credentials not configured (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET)')
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft Graph auth failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  cachedToken = {
    value:     json.access_token as string,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  }
  return cachedToken.value
}

export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAppToken()
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
}
