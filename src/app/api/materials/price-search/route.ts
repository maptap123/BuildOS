import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
// TODO (Phase 5a): import { getApifyClient } from '@/lib/apify/client'
// TODO (Phase 5a): import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/materials/price-search?q=...&zip=...
 *
 * Cache-first material price lookup. Checks price_cache before calling Apify.
 *
 * Query params:
 *   q    — material search string (e.g. "2x4x8 pressure treated lumber")
 *   zip  — US ZIP code for local store pricing (optional, defaults to org ZIP)
 *
 * Response (once implemented):
 *   {
 *     source: 'cache' | 'live',
 *     results: PriceResult[],     // sorted by price_cents ASC
 *     cached_at?: string          // ISO timestamp of oldest cache hit
 *   }
 *
 * Phase 5a implementation plan:
 *   1. Auth + budget view permission check
 *   2. Normalise query string (lowercase, trim)
 *   3. Check price_cache WHERE query ILIKE $q AND scraped_at > NOW() - $TTL
 *   4. If fresh cache hit: return { source: 'cache', results }
 *   5. Otherwise: call getApifyClient().searchPrice(q, zip)
 *   6. Upsert results into price_cache
 *   7. Return { source: 'live', results }
 *
 * Phase 5b additions:
 *   - Run all configured retailers in parallel via Promise.all
 *   - Merge + deduplicate by sku, sort by price_cents ASC
 *   - Add ?retailers=home_depot,lowes filter param
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: budgetPerm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()

  if (!budgetPerm?.can_view) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q   = searchParams.get('q')?.trim()
  const zip = searchParams.get('zip')?.trim()

  if (!q) {
    return NextResponse.json({ error: 'q (search query) is required' }, { status: 400 })
  }

  // TODO (Phase 5a): cache-first lookup + Apify actor call
  return NextResponse.json(
    {
      error: 'Material price search not yet configured',
      note: 'Phase 5a: Set APIFY_API_TOKEN env var and implement the Apify actor call in /lib/apify/client.ts.',
      query: q,
      zip: zip ?? null,
    },
    { status: 501 }
  )
}
