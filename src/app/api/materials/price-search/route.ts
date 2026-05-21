import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse }      from 'next/server'
import { getApifyClient }    from '@/lib/apify/client'
import type { PriceResult }  from '@/lib/apify/client'

/**
 * GET /api/materials/price-search?q=...&zip=...
 *
 * Cache-first material price lookup. Checks price_cache (24 h TTL) before
 * calling Apify. Requires budget view permission.
 *
 * Query params:
 *   q    — material search string (e.g. "2x4x8 pressure treated lumber")
 *   zip  — US ZIP code for local store pricing (optional)
 *
 * Response shapes:
 *   { source: 'cache',       results: PriceResult[], cached_at: string }
 *   { source: 'live',        results: PriceResult[], cached_at: null   }
 *   { source: 'unavailable', results: [],            message: string   }
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: budgetPerm } = await createAdminClient()
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
  const zip = searchParams.get('zip')?.trim() || undefined

  if (!q) {
    return NextResponse.json({ error: 'q (search query) is required' }, { status: 400 })
  }

  // Graceful unavailable — no token set
  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({
      source:  'unavailable',
      results: [],
      message: 'Price lookup requires APIFY_API_TOKEN',
    })
  }

  const normalized = q.toLowerCase().trim()
  const admin      = createAdminClient()

  // 1. Cache-first check
  const { data: cached } = await admin
    .from('price_cache')
    .select('*')
    .ilike('query', normalized)
    .in('retailer', ['home_depot', 'lowes'])
    .gt('scraped_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('price_cents', { ascending: true })

  if (cached && cached.length > 0) {
    const results: PriceResult[] = cached.map(row => ({
      retailer:     row.retailer,
      product_name: row.product_name,
      sku:          row.sku   ?? undefined,
      price_cents:  row.price_cents,
      unit:         row.unit  ?? undefined,
      url:          row.url   ?? undefined,
      store_number: row.store_number ?? undefined,
      zip_code:     row.zip_code     ?? undefined,
      scraped_at:   row.scraped_at,
    }))

    return NextResponse.json({
      source:    'cache',
      results,
      cached_at: cached[0].scraped_at,
    })
  }

  // 2. Live Apify fetch
  const apify  = getApifyClient()
  const results = await apify.searchPriceAllRetailers(normalized, zip)

  // 3. Persist to cache (best-effort; don't block response on failure)
  if (results.length > 0) {
    const rows = results.map(r => ({
      query:        normalized,
      retailer:     r.retailer,
      product_name: r.product_name,
      sku:          r.sku          ?? null,
      price_cents:  r.price_cents,
      unit:         r.unit         ?? null,
      url:          r.url          ?? null,
      store_number: r.store_number ?? null,
      zip_code:     r.zip_code     ?? null,
      scraped_at:   r.scraped_at,
    }))

    admin.from('price_cache').insert(rows).then(({ error }) => {
      if (error) console.error('[price-search] cache insert error:', error.message)
    })
  }

  return NextResponse.json({ source: 'live', results, cached_at: null })
}
