import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mergeCostTypeRows,
  splitOrDefault,
  toCost,
  unitCostFrom,
  type CostBreakdown,
} from './costBreakdown'
import { costCodeVariants, normalizeCostCode } from './costCodes'
import { divisionPhase } from './divisions'

/**
 * Turning what Fixer cites into priced estimate lines
 * ===================================================
 * Shared by both tool dispatchers (`api/agent/route.ts` and `lib/hermes/tools.ts`) so a
 * line built in the app and the same line built over SMS come out identical. The Hermes
 * copy used to insert a bare unit_cost with no split, no source_line_id and no comp — the
 * dual-dispatch rule exists precisely because that kind of drift is invisible until an
 * estimate looks wrong.
 */

/** JDC prices every line at 50% unless an estimator changes it by hand in the builder. */
export const DEFAULT_MARKUP_PCT = 50

/**
 * One shape for a line Fixer priced, whether it is about to be staged for review or
 * written straight onto the estimate. Both paths build it here so an approved proposal
 * and a direct write can never disagree about coercion or provenance.
 */
export interface AiEstimateLineDraft {
  /** Copied from the cited source row. Empty when nothing could be cited. */
  description: string
  /** 'unsourced' means Fixer matched no real line — a person has to name it. */
  name_status: 'sourced' | 'unsourced'
  /** What the model would have called it. A hint for the estimator, never the name. */
  suggested_description: string | null
  /** Always the line's cost code division, e.g. "02 Tear-Out and Demolition". Never typed. */
  phase: string
  cost_code: string | null
  uom: string
  quantity: number
  /** Always the sum of the three buckets. */
  unit_cost: number
  labor_cost: number | null
  material_cost: number | null
  sub_cost: number | null
  markup_pct: number
  sort_order: number
  source: 'ai_comp' | 'ai_market'
  source_line_id: string | null
  cost_item_id: string | null
  comp_job_id: string | null
  comp_estimate_id: string | null
  comp_label: string | null
  ai_rationale: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identifies one workbook line across the rows the importer split it into. */
export const groupKey = (estimateId: string, rowNumber: number) => `${estimateId}:${rowNumber}`

export interface GroupPair {
  historical_estimate_id: string
  row_number: number
}

/**
 * The labor/material/sub split of specific workbook lines, keyed by `groupKey`.
 *
 * Asks for the exact (estimate, row) pairs. The obvious spelling — `.in(estimate_ids)`
 * crossed with `.in(row_numbers)` — is a cross product, and that is what broke the
 * Schroeder estimate: 39 cited lines widened to 159 estimates x 217 row numbers, ~34,500
 * candidate rows against PostgREST's 1,000-row cap, so two thirds of the real pairs never
 * came back and their lines were stored with no split at all. Nothing errored; the numbers
 * were simply missing. Pairs are chunked and each request is explicitly bounded so a
 * silent truncation cannot happen again.
 */
export async function fetchGroupSplits(
  admin: SupabaseClient,
  pairs: GroupPair[]
): Promise<Map<string, CostBreakdown & { unit_cost: number }>> {
  const splits = new Map<string, CostBreakdown & { unit_cost: number }>()

  // Deduplicate, and drop anything that would not be safe inside an or() filter — its
  // terms are comma/paren delimited, so a stray character would silently reshape the query.
  const wanted = new Map<string, GroupPair>()
  for (const p of pairs) {
    if (!UUID.test(p.historical_estimate_id ?? '')) continue
    if (!Number.isSafeInteger(p.row_number)) continue
    wanted.set(groupKey(p.historical_estimate_id, p.row_number), p)
  }
  if (wanted.size === 0) return splits

  const CHUNK = 50
  // A workbook line splits into at most one row per cost type, but the ceiling is kept
  // generous and still far below the 1,000-row cap so a chunk can never be cut short.
  const ROWS_PER_PAIR = 10

  const all = [...wanted.values()]
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK)
    const filter = chunk
      .map(p => `and(historical_estimate_id.eq.${p.historical_estimate_id},row_number.eq.${p.row_number})`)
      .join(',')

    const { data, error } = await admin
      .from('historical_estimate_lines')
      .select('historical_estimate_id, row_number, cost_type, unit_cost')
      .or(filter)
      .limit(chunk.length * ROWS_PER_PAIR)
    if (error) throw error

    const grouped = new Map<string, { cost_type: string | null; unit_cost: number }[]>()
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const key = groupKey(r.historical_estimate_id as string, Number(r.row_number))
      if (!wanted.has(key)) continue
      const entry = { cost_type: r.cost_type as string | null, unit_cost: Number(r.unit_cost) }
      const bucket = grouped.get(key)
      if (bucket) bucket.push(entry)
      else grouped.set(key, [entry])
    }
    for (const [key, group] of grouped) splits.set(key, mergeCostTypeRows(group))
  }

  return splits
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed || null
}

// These land in numeric columns — a missing or non-numeric value must not become NaN.
const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const norm = (v: string) => v.trim().toLowerCase()

export async function buildAiEstimateLines(
  admin: SupabaseClient,
  incoming: Record<string, unknown>[],
  startOrder: number
): Promise<AiEstimateLineDraft[]> {
  // ── Resolve every citation in batched lookups ────────────────────────────
  const lineIds = [...new Set(incoming.map(l => str(l.line_id)).filter(Boolean) as string[])]
  const codes   = [...new Set(incoming.map(l => str(l.cost_code)).filter(Boolean) as string[])]

  // Only lines that cited no id can ever fall through to a name match, and matching by
  // name is expensive: these descriptions are JDC's fixed vocabulary, so one of them can
  // appear in a hundred past estimates. Narrowing the set first keeps this lookup small
  // instead of dragging thousands of unrelated rows into the resolution below.
  const typed = [...new Set(
    incoming.filter(l => !str(l.line_id)).map(l => str(l.description)).filter(Boolean) as string[]
  )]

  const empty = { data: [] as Record<string, unknown>[] }
  const HIST_SELECT = 'id, historical_estimate_id, row_number, description, cost_code, division_num, division_name, uom'

  const [sourceLines, catalogItems, typedHist, typedCatalog] = await Promise.all([
    lineIds.length
      ? admin.from('historical_estimate_lines').select(HIST_SELECT).in('id', lineIds).limit(lineIds.length)
      : Promise.resolve(empty),
    codes.length
      ? admin.from('cost_catalog')
          .select('id, cost_code, division_num, division_name, title, uom, unit_cost, labor_cost, material_cost, sub_cost')
          // Both spellings: the cost book writes `14.3000.`, the workbooks `14.3040`.
          .in('cost_code', costCodeVariants(codes))
      : Promise.resolve(empty),
    // Last resort: the model retyped a name that really is in the vocabulary. Accept it,
    // but snap to the stored spelling so the estimate stays internally consistent.
    // Ordered so the row chosen for a repeated name is stable between runs.
    typed.length
      ? admin.from('historical_estimate_lines').select(HIST_SELECT)
          .in('description', typed)
          .order('historical_estimate_id').order('row_number')
          .limit(1000)
      : Promise.resolve(empty),
    typed.length
      ? admin.from('cost_catalog').select('id, cost_code, division_num, division_name, title, uom').in('title', typed)
      : Promise.resolve(empty),
  ])

  // PostgREST hands back differently-shaped rows per table; one loose record type
  // keeps the lookup below from having to narrow a union at every access.
  const rows = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[]

  const byLineId = new Map(rows(sourceLines).map(r => [r.id as string, r]))
  const byCode = new Map(rows(catalogItems).map(r => [normalizeCostCode(r.cost_code as string), r]))

  const byName = new Map<string, Record<string, unknown>>()
  // First match wins, so a repeated description resolves the same way every run.
  for (const r of rows(typedHist)) {
    const k = norm(r.description as string)
    if (!byName.has(k)) byName.set(k, r)
  }
  for (const r of rows(typedCatalog)) {
    const k = norm(r.title as string)
    if (!byName.has(k)) byName.set(k, r)
  }

  // ── Decide what each line resolved to, before fetching any splits ────────
  // Resolution has to come first: only the rows that actually won are worth looking up
  // siblings for. Widening the sibling query to every candidate is what broke it before.
  const resolutions = incoming.map(l => {
    const citedLine = str(l.line_id)
    const citedCode = str(l.cost_code)
    const citedName = str(l.description)

    const sourceLine = citedLine ? byLineId.get(citedLine) : undefined
    const catalogItem = !sourceLine && citedCode ? byCode.get(normalizeCostCode(citedCode)) : undefined
    const namedMatch = !sourceLine && !catalogItem && citedName ? byName.get(norm(citedName)) : undefined

    return { line: l, citedCode, citedName, sourceLine, catalogItem, namedMatch }
  })

  const pairs: GroupPair[] = []
  const compIds = new Set<string>()
  for (const r of resolutions) {
    const c = str(r.line.comp_estimate_id)
    if (c) compIds.add(c)

    const fromHistorical = r.sourceLine ?? r.namedMatch
    if (!fromHistorical?.historical_estimate_id) continue
    compIds.add(fromHistorical.historical_estimate_id as string)
    pairs.push({
      historical_estimate_id: fromHistorical.historical_estimate_id as string,
      row_number: Number(fromHistorical.row_number),
    })
  }

  const splitByGroup = await fetchGroupSplits(admin, pairs)

  // Comp job attribution, resolved from whichever historical estimate the name came from.
  const compById = new Map<string, { jobId: string | null; label: string | null }>()
  if (compIds.size > 0) {
    const { data: comps } = await admin
      .from('historical_estimates')
      .select('id, job_id, display_name')
      .in('id', [...compIds])
    for (const c of comps ?? []) {
      compById.set(c.id as string, {
        jobId: (c.job_id as string | null) ?? null,
        label: (c.display_name as string | null) ?? null,
      })
    }
  }

  return resolutions.map((r, i) => {
    const { line: l, citedCode, citedName, sourceLine, catalogItem, namedMatch } = r
    const resolved = sourceLine ?? catalogItem ?? namedMatch

    // The description is whatever the source row calls it. What the model typed is never
    // the name: JDC reuses a fixed vocabulary and a paraphrase reads as a different item.
    // In cost_catalog that name is `title` — its `description` holds usage metadata.
    const canonicalName = resolved
      ? String(resolved.description ?? resolved.title ?? '').trim()
      : ''

    const fromHistorical = sourceLine ?? namedMatch
    const compEstimateId =
      (fromHistorical?.historical_estimate_id as string | undefined)
      ?? str(l.comp_estimate_id)
      ?? null
    const comp = compEstimateId ? compById.get(compEstimateId) : undefined

    const isHistorical = !!(fromHistorical?.historical_estimate_id)
    const catalogRow = catalogItem ?? (namedMatch && namedMatch.title ? namedMatch : undefined)

    // Where the split comes from, in order: what Fixer sent (it may be adjusting a
    // rate), then the cited workbook line, then the cost book entry. The unit cost is
    // never typed — it is whatever the three buckets add up to.
    const sent = {
      labor_cost: toCost(l.labor_cost),
      material_cost: toCost(l.material_cost),
      sub_cost: toCost(l.sub_cost),
    }
    const groupSplit = fromHistorical
      ? splitByGroup.get(groupKey(
          fromHistorical.historical_estimate_id as string,
          Number(fromHistorical.row_number)
        ))
      : undefined
    const catalogSplit = catalogRow
      ? {
          labor_cost: toCost(catalogRow.labor_cost),
          material_cost: toCost(catalogRow.material_cost),
          sub_cost: toCost(catalogRow.sub_cost),
        }
      : undefined

    const known = unitCostFrom(sent) !== null ? sent : (groupSplit ?? catalogSplit)
    // Nothing known about the split still yields one: the price lands in material rather
    // than being stored as a bare unit cost with three empty buckets.
    const split = splitOrDefault(num(l.unit_cost, 0), known)

    const priced = {
      labor_cost: split.labor_cost,
      material_cost: split.material_cost,
      sub_cost: split.sub_cost,
      unit_cost: unitCostFrom(split) ?? 0,
    }

    const blank = splitOrDefault(0, null)

    // The stored code wins over the cited one — it carries the cost book's spelling, and
    // it is what the phase is derived from.
    const lineCostCode = (resolved ? str(resolved.cost_code as string) : null) ?? citedCode

    return {
      // An unsourced line carries no name at all rather than a plausible-looking guess.
      description: canonicalName,
      name_status: (canonicalName ? 'sourced' : 'unsourced') as 'sourced' | 'unsourced',
      suggested_description: canonicalName ? null : citedName,
      // The grouping is the cost code's division, not something the model names. Whatever
      // it sent as `phase` is discarded — see lib/estimates/divisions.ts.
      phase: divisionPhase(
        resolved ? str(resolved.division_num as string) : null,
        lineCostCode,
        resolved ? str(resolved.division_name as string) : null
      ),
      cost_code: lineCostCode,
      uom: (resolved ? str(resolved.uom as string) : null) ?? str(l.uom) ?? 'EA',
      quantity: num(l.quantity, 1),
      // An unnamed line gets no price either — a number beside a blank name invites
      // approving it unread.
      ...(canonicalName
        ? priced
        : { unit_cost: 0, ...blank }),
      // Always 50%. Fixer used to copy the comp's markup across, which is why a batch of
      // lines came out at 50.04%, 50.13%, 50.40% — the estimator sets this, not the model.
      markup_pct: canonicalName ? DEFAULT_MARKUP_PCT : 0,
      sort_order: startOrder + i,
      // source is constrained to manual|catalog|assembly|ai_comp|ai_market.
      source: (isHistorical ? 'ai_comp' : 'ai_market') as 'ai_comp' | 'ai_market',
      source_line_id: (fromHistorical?.id as string | undefined) ?? null,
      cost_item_id: (catalogRow?.id as string | undefined) ?? null,
      comp_job_id: comp?.jobId ?? null,
      comp_estimate_id: compEstimateId,
      comp_label: comp?.label ?? null,
      ai_rationale: str(l.rationale),
    }
  })
}
