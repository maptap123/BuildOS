/**
 * Apify REST API Client — STUB
 *
 * Phase 5a integration. Wraps Apify actor runs for material price scraping.
 * Not wired up yet — implement once APIFY_API_TOKEN is provisioned.
 *
 * Apify actor catalogue (add retailers per Phase 5b / 5c):
 *   Phase 5a:  studio-amba/homedepot-scraper  — Home Depot price + availability by ZIP
 *   Phase 5b:  studio-amba/lowes-scraper      — Lowe's
 *   Phase 5c:  private actor (custom build)    — Sherwin-Williams
 *
 * Required environment variables (add to Vercel + .env.local when ready):
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

export class ApifyClient {
  private apiToken: string

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  /**
   * Search for a material price across configured retailers.
   * Returns a cache-ready list of PriceResult objects.
   *
   * The caller (/api/materials/price-search) is responsible for:
   *   1. Checking price_cache for a fresh result first (TTL = PRICE_CACHE_TTL_HOURS)
   *   2. If stale/missing: calling this method
   *   3. Writing results into price_cache
   *   4. Returning merged + sorted results
   *
   * TODO (Phase 5a): implement
   *   1. POST https://api.apify.com/v2/acts/studio-amba~homedepot-scraper/runs
   *      body: { "search": query, "zipCode": zip }
   *   2. Poll run status until 'SUCCEEDED' (or use waitForFinish param)
   *   3. GET /v2/datasets/{defaultDatasetId}/items
   *   4. Map response rows → PriceResult[]
   *   5. Phase 5b: wrap all configured retailers in Promise.all
   *
   * @param query  — free-text material search (e.g. '2x4x8 lumber')
   * @param zip    — US ZIP code for local store prices
   */
  async searchPrice(query: string, zip?: string, _options?: PriceSearchOptions): Promise<PriceResult[]> {
    // Log the call for future debugging — remove when implementing
    console.log('[Apify stub] searchPrice()', { query, zip, apiTokenPresent: !!this.apiToken })

    // TODO (Phase 5a): implement Apify actor call
    throw new Error('Apify integration not yet configured')
  }
}

/**
 * Lazy singleton — only constructed when APIFY_API_TOKEN is present.
 * Import this in route handlers; it will throw at runtime (not import time).
 *
 * Usage:
 *   import { getApifyClient } from '@/lib/apify/client'
 *   const client = getApifyClient()   // throws 501 if not configured
 */
export function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new Error('Apify integration not yet configured — set APIFY_API_TOKEN env var')
  }
  return new ApifyClient(token)
}
