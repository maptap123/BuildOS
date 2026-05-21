/**
 * Apify REST API Client
 *
 * Phase 5a integration. Wraps Apify actor runs for material price scraping.
 *
 * Apify actor catalogue:
 *   Phase 5a:  epctex/home-depot-scraper — Home Depot price + availability by ZIP
 *   Phase 5b:  epctex/lowes-scraper      — Lowe's
 *
 * Required environment variables:
 *   APIFY_API_TOKEN        — from apify.com/account#/integrations
 *   PRICE_CACHE_TTL_HOURS  — default 24; how long before a cached result is stale
 *
 * Reference: https://docs.apify.com/api/v2#/reference/actor-runs/run-actor
 */

export interface PriceResult {
  retailer:     string
  product_name: string
  sku?:         string
  price_cents:  number   // price in US cents
  unit?:        string
  url?:         string
  store_number?: string
  zip_code?:    string
  scraped_at:   string   // ISO 8601
}

export interface PriceSearchOptions {
  /** ZIP code for local store pricing (e.g. '90210') */
  zip?: string
  /** Max results to return per retailer — default 5 */
  limit?: number
}

interface ApifyRunResponse {
  data: {
    id: string
    status: string
    defaultDatasetId: string
  }
}

interface HomeDepotItem {
  title?: string
  price?: number
  sku?: string
  url?: string
  storeId?: string
}

interface LowesItem {
  title?: string
  price?: number
  sku?: string
  url?: string
}

const APIFY_BASE = 'https://api.apify.com/v2'
const RETAILERS = {
  home_depot: 'epctex~home-depot-scraper',
  lowes:      'epctex~lowes-scraper',
} as const

type RetailerKey = keyof typeof RETAILERS

export class ApifyClient {
  private apiToken: string

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  private async runActor(actorId: string, body: Record<string, unknown>): Promise<ApifyRunResponse['data'] | null> {
    const url = `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=60&token=${this.apiToken}`
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      console.error(`[Apify] Actor ${actorId} run failed: ${res.status}`)
      return null
    }
    const json = (await res.json()) as ApifyRunResponse
    if (json.data.status !== 'SUCCEEDED') {
      console.error(`[Apify] Actor ${actorId} status: ${json.data.status}`)
      return null
    }
    return json.data
  }

  private async fetchDatasetItems(actorId: string): Promise<unknown[]> {
    const url = `${APIFY_BASE}/acts/${actorId}/runs/last/dataset/items?token=${this.apiToken}&limit=10`
    const res = await fetch(url)
    if (!res.ok) return []
    return (await res.json()) as unknown[]
  }

  private mapHomeDepot(items: unknown[], zip?: string): PriceResult[] {
    return (items as HomeDepotItem[])
      .filter(item => item.price != null && item.title)
      .map(item => ({
        retailer:     'home_depot',
        product_name: item.title!,
        sku:          item.sku,
        price_cents:  Math.round((item.price ?? 0) * 100),
        url:          item.url,
        store_number: item.storeId,
        zip_code:     zip,
        scraped_at:   new Date().toISOString(),
      }))
  }

  private mapLowes(items: unknown[], zip?: string): PriceResult[] {
    return (items as LowesItem[])
      .filter(item => item.price != null && item.title)
      .map(item => ({
        retailer:     'lowes',
        product_name: item.title!,
        sku:          item.sku,
        price_cents:  Math.round((item.price ?? 0) * 100),
        url:          item.url,
        zip_code:     zip,
        scraped_at:   new Date().toISOString(),
      }))
  }

  async searchRetailer(retailer: RetailerKey, query: string, zip?: string, limit?: number): Promise<PriceResult[]> {
    const actorId = RETAILERS[retailer]
    const body    = { search: query, zipCode: zip, maxItems: limit ?? 5 }
    const run     = await this.runActor(actorId, body)
    if (!run) return []

    const items = await this.fetchDatasetItems(actorId)
    return retailer === 'home_depot'
      ? this.mapHomeDepot(items, zip)
      : this.mapLowes(items, zip)
  }

  async searchPriceAllRetailers(query: string, zip?: string, options?: PriceSearchOptions): Promise<PriceResult[]> {
    const limit   = options?.limit
    const results = await Promise.allSettled([
      this.searchRetailer('home_depot', query, zip, limit),
      this.searchRetailer('lowes',      query, zip, limit),
    ])

    const merged: PriceResult[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') merged.push(...r.value)
      else console.error('[Apify] Retailer search failed:', r.reason)
    }

    return merged.sort((a, b) => a.price_cents - b.price_cents)
  }

  /** @deprecated Use searchPriceAllRetailers instead */
  async searchPrice(query: string, zip?: string, options?: PriceSearchOptions): Promise<PriceResult[]> {
    return this.searchPriceAllRetailers(query, zip, options)
  }
}

/**
 * Lazy singleton — only constructed when APIFY_API_TOKEN is present.
 */
export function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new Error('Apify integration not yet configured — set APIFY_API_TOKEN env var')
  }
  return new ApifyClient(token)
}
