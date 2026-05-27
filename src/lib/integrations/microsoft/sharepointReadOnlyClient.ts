// Microsoft SharePoint read-only client using Microsoft Graph app-only auth.
// Required env vars:
//   MICROSOFT_TENANT_ID     — Azure AD tenant ID
//   MICROSOFT_CLIENT_ID     — App registration client ID
//   MICROSOFT_CLIENT_SECRET — App registration client secret
//   SHAREPOINT_SITE_URL     — e.g. https://jdcremodeling.sharepoint.com/sites/Documents

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ─── App-only token ───────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null

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

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SPDriveItem {
  id: string
  name: string
  webUrl: string
  folder?: { childCount: number }
  parentReference?: { driveId: string; path: string }
  createdDateTime?: string
  lastModifiedDateTime?: string
}

export interface SPSearchHit {
  hitId: string
  rank: number
  resource: SPDriveItem
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search SharePoint drive items by keyword using Microsoft Graph Search API.
 * Uses region 'NAM' as required for tenant location.
 */
export async function searchSharePointDriveItems(
  queryString: string,
  limit = 25
): Promise<SPSearchHit[]> {
  const siteUrl = process.env.SHAREPOINT_SITE_URL
  if (!siteUrl) throw new Error('SHAREPOINT_SITE_URL is not configured')

  const body = {
    requests: [
      {
        entityTypes: ['driveItem'],
        query: { queryString },
        region: 'NAM',
        from: 0,
        size: limit,
        fields: ['id', 'name', 'webUrl', 'parentReference', 'folder', 'createdDateTime', 'lastModifiedDateTime'],
      },
    ],
  }

  const res = await graphFetch('/search/query', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SharePoint search failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  const hitsContainers: Array<{ hits?: SPSearchHit[] }> =
    json?.value?.[0]?.hitsContainers ?? []

  const hits: SPSearchHit[] = []
  for (const container of hitsContainers) {
    if (container.hits) hits.push(...container.hits)
  }
  return hits
}

/**
 * List children of a SharePoint folder by driveId and folderId.
 * Returns only folders by default.
 */
export async function listSharePointFolderChildren(
  driveId: string,
  folderId: string,
  foldersOnly = true
): Promise<SPDriveItem[]> {
  let path = `/drives/${driveId}/items/${folderId}/children`
  if (foldersOnly) path += '?$filter=folder ne null'

  const res = await graphFetch(path)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SharePoint folder list failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  return (json?.value ?? []) as SPDriveItem[]
}
