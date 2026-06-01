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
  size?: number
  folder?: { childCount: number }
  file?: { mimeType: string }
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

/**
 * Resolve a SharePoint folder web URL to a composite drive item ID ({driveId}!{itemId})
 * using the Microsoft Graph /shares/ endpoint. Also returns the children of that folder.
 *
 * Works with any direct SharePoint folder URL stored in jobs.sharepoint_folder_url.
 * Microsoft Graph accepts the u!{base64url(webUrl)} sharing token for direct item URLs.
 */
export async function listSharePointFolderContentsByUrl(
  webUrl: string
): Promise<{ items: SPDriveItem[]; compositeId: string }> {
  const b64 = Buffer.from(webUrl, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const token = `u!${b64}`

  const res = await graphFetch(`/shares/${token}/driveItem?$select=id,parentReference`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cannot access SharePoint folder via URL (${res.status}): ${text}`)
  }

  const item = (await res.json()) as SPDriveItem
  const driveId = item.parentReference?.driveId
  if (!driveId) throw new Error('SharePoint response missing driveId — check app permissions')

  const compositeId = `${driveId}!${item.id}`
  const items = await listSharePointFolderContents(compositeId)
  return { items, compositeId }
}

/**
 * List all files (and optionally folders) in a SharePoint folder, with pagination.
 * Parses a composite driveItemId in the form "{driveId}!{itemId}" as stored in jobs.sharepoint_drive_item_id.
 */
export async function listSharePointFolderContents(
  compositeId: string
): Promise<SPDriveItem[]> {
  // SharePoint driveIds have the form "b!{base64}" which itself contains a "!".
  // Use lastIndexOf so we split at the separator between driveId and itemId,
  // not at the "!" inside the "b!" prefix.
  const sep = compositeId.lastIndexOf('!')
  if (sep === -1) throw new Error('sharepoint_drive_item_id has no driveId (missing "!")')

  const driveId  = compositeId.slice(0, sep)
  const folderId = compositeId.slice(sep + 1)

  const select = 'id,name,webUrl,size,file,folder,parentReference,createdDateTime,lastModifiedDateTime'
  let nextLink: string | null =
    `/drives/${driveId}/items/${folderId}/children?$select=${select}&$top=200`

  const items: SPDriveItem[] = []

  while (nextLink) {
    const res = await graphFetch(nextLink)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SharePoint file list failed (${res.status}): ${text}`)
    }
    const json = await res.json()
    items.push(...((json?.value ?? []) as SPDriveItem[]))
    nextLink = json['@odata.nextLink'] ?? null
  }

  return items
}

/**
 * Fetches a SharePoint file's raw bytes via the Graph /content endpoint.
 * @microsoft.graph.downloadUrl is only available for personal OneDrive, not SharePoint;
 * /content is the correct approach for SharePoint-hosted files.
 * fetch follows the 302 redirect internally and returns the actual file response.
 */
export async function fetchSharePointItemContent(
  driveId: string,
  itemId: string
): Promise<Response> {
  return graphFetch(`/drives/${driveId}/items/${itemId}/content`)
}
