import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Line-level pricing lookup
 * =========================
 * `match_historical_estimates` compares whole estimates, so a specialty item gets
 * missed whenever the job that priced it looks nothing like the new one — a glass
 * shower enclosure sitting on an exterior remodel, say. This searches the 12,000
 * line items directly instead, so one item can be priced from JDC's own history
 * even when its job never surfaces as a comparable.
 *
 * Results come back newest first because unit costs move: the same enclosure was
 * $2,000 in 2024 and $3,000 in 2026, and the most recent price is the one to reuse.
 *
 * Shared by both tool dispatchers (`lib/hermes/tools.ts` and `api/agent/route.ts`)
 * so the two cannot drift apart.
 */

export interface LinePricingRow {
  job_name:    string | null
  year:        string | null
  cost_code:   string | null
  cost_type:   string | null
  description: string
  uom:         string
  quantity:    number
  unit_cost:   number
  markup_pct:  number
}

export interface LinePricingResult {
  item: string
  /** How many of the query's words the returned lines actually contain. */
  matched_words: number
  of_words: number
  count: number
  /** Newest first — reuse the most recent unit cost. */
  pricing: LinePricingRow[]
  most_recent?: { year: string | null; unit_cost: number; uom: string; description: string }
  unit_cost_range?: { low: number; high: number }
  message?: string
}

/** PostgREST's `or` filter is comma/paren delimited, so a stray one would break the query. */
function sanitize(word: string): string {
  return word.replace(/[^a-z0-9]/gi, '')
}

const SELECT =
  'description, cost_code, cost_type, uom, quantity, unit_cost, markup_pct, ' +
  'historical_estimates(display_name, source_year)'

interface RawRow {
  description: string
  cost_code: string | null
  cost_type: string | null
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
  historical_estimates: { display_name: string | null; source_year: string | null } | null
}

export async function findLinePricing(
  admin: SupabaseClient,
  item: string,
  limit = 15
): Promise<LinePricingResult> {
  const words = item.toLowerCase().split(/\s+/).map(sanitize).filter(w => w.length > 2)

  if (words.length === 0) {
    return { item, matched_words: 0, of_words: 0, count: 0, pricing: [], message: 'Give an item with at least one word longer than two letters.' }
  }

  /** Requires the whole word, so "glass" does not match inside "fiberglass". */
  const hits = (description: string, word: string) =>
    new RegExp(`\\b${word}`, 'i').test(description)

  async function andQuery(subset: string[]): Promise<RawRow[]> {
    let q = admin.from('historical_estimate_lines').select(SELECT)
    for (const w of subset) q = q.ilike('description', `%${w}%`)
    const { data, error } = await q.limit(200)
    if (error) throw error
    return (data ?? []) as unknown as RawRow[]
  }

  // Narrow queries, widened only a step at a time. One broad "any word" fetch
  // truncates before it reaches the real matches — searching every line containing
  // "shower" buries "Glass Shower Enclosure" among thousands — and treating a single
  // shared word as a match is worse than useless: "heated floor" would come back with
  // hardwood flooring priced as though it were the answer.
  let raw = await andQuery(words)

  // "glass shower door" matches nothing verbatim, but "Glass Shower Enclosure" and
  // "Shower hinge door" are both real answers, so drop one word and look again.
  if (raw.length === 0 && words.length >= 3) {
    const seen = new Set<string>()
    for (let i = 0; i < words.length; i++) {
      const subset = words.filter((_, j) => j !== i)
      for (const row of await andQuery(subset)) {
        const key = `${row.description}|${row.unit_cost}|${row.uom}`
        if (!seen.has(key)) { seen.add(key); raw.push(row) }
      }
    }
  }

  const scored = raw.map(r => ({ row: r, score: words.filter(w => hits(r.description, w)).length }))
  const best = scored.reduce((m, s) => Math.max(m, s.score), 0)

  // One word out of several is a coincidence, not a match for the item asked about.
  const required = words.length >= 2 ? 2 : 1
  if (best < required) {
    return {
      item, matched_words: best, of_words: words.length, count: 0, pricing: [],
      message: `No past JDC line matches "${item}". Price it at a realistic market rate and mark that line source:"market" — do not reuse a loosely related line.`,
    }
  }

  raw = scored.filter(s => s.score === best).map(s => s.row)

  const rows: LinePricingRow[] = raw
    .map(r => ({
      job_name:    r.historical_estimates?.display_name ?? null,
      year:        r.historical_estimates?.source_year ?? null,
      cost_code:   r.cost_code,
      cost_type:   r.cost_type,
      description: r.description,
      uom:         r.uom,
      quantity:    Number(r.quantity),
      unit_cost:   Number(r.unit_cost),
      markup_pct:  Number(r.markup_pct),
    }))
    .filter(r => r.unit_cost > 0)
    .sort((a, b) => (b.year ?? '').localeCompare(a.year ?? '') || b.unit_cost - a.unit_cost)

  if (rows.length === 0) {
    return {
      item, matched_words: best, of_words: words.length, count: 0, pricing: [],
      message: `No past JDC line matches "${item}". Price it at a realistic market rate and mark that line source:"market".`,
    }
  }

  const capped = rows.slice(0, Math.min(Math.max(Math.trunc(limit) || 15, 1), 40))
  const costs = rows.map(r => r.unit_cost)

  return {
    item,
    matched_words: best,
    of_words: words.length,
    count: rows.length,
    pricing: capped,
    most_recent: {
      year:        rows[0].year,
      unit_cost:   rows[0].unit_cost,
      uom:         rows[0].uom,
      description: rows[0].description,
    },
    unit_cost_range: { low: Math.min(...costs), high: Math.max(...costs) },
  }
}
