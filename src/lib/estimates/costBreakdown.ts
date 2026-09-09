/**
 * Labor / material / sub on a line
 * ================================
 * JDC prices a line in up to three buckets, and always has — the imported workbooks
 * carry the same item as a labor row and a material row sharing one row_number, and
 * cost_catalog stores unit_cost = labor_cost + material_cost for all 5,388 entries.
 *
 * The rule everywhere:
 *
 *     unit_cost = labor_cost + material_cost + sub_cost
 *
 * A line with no breakdown at all (typed by hand, or from an assembly) keeps its own
 * unit_cost and leaves the buckets null. That is why this returns null rather than 0
 * when nothing is set: 0 would silently zero out a hand-priced line.
 */

export interface CostBreakdown {
  labor_cost: number | null
  material_cost: number | null
  sub_cost: number | null
}

export const BREAKDOWN_FIELDS = ['labor_cost', 'material_cost', 'sub_cost'] as const

export type BreakdownField = typeof BREAKDOWN_FIELDS[number]

/** A number, or null when the value is absent or unparseable. Empty input stays empty. */
export function toCost(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Money, to the 4 decimals the columns store. Summing floats otherwise surfaces
 * 1.60 + 4.43 = 6.029999999999999 in the estimate and in what Fixer is shown.
 */
function round(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

export function hasBreakdown(b: Partial<CostBreakdown>): boolean {
  return BREAKDOWN_FIELDS.some(f => toCost(b[f]) !== null)
}

/**
 * The unit cost implied by the buckets, or null when there are none — in which case
 * the caller should leave whatever unit_cost is already on the line alone.
 */
export function unitCostFrom(b: Partial<CostBreakdown>): number | null {
  if (!hasBreakdown(b)) return null
  return round(BREAKDOWN_FIELDS.reduce((sum, f) => sum + (toCost(b[f]) ?? 0), 0))
}

/**
 * Applies the rule to an update payload: whenever a bucket is being written, unit_cost
 * is recomputed from the merged result so the two can never disagree.
 *
 * @param incoming the fields being changed
 * @param current  the line as stored, for buckets the update does not mention
 */
export function withDerivedUnitCost(
  incoming: Record<string, unknown>,
  current?: Partial<CostBreakdown>
): Record<string, unknown> {
  const touchesBreakdown = BREAKDOWN_FIELDS.some(f => f in incoming)
  if (!touchesBreakdown) return incoming

  const merged: Partial<CostBreakdown> = {}
  for (const f of BREAKDOWN_FIELDS) {
    merged[f] = f in incoming ? toCost(incoming[f]) : (current ? toCost(current[f]) : null)
  }

  const derived = unitCostFrom(merged)
  return {
    ...incoming,
    ...merged,
    // All three cleared: fall back to whatever unit_cost the caller sent, or leave it.
    ...(derived === null ? {} : { unit_cost: derived }),
  }
}

// ── Reading the imported workbooks ───────────────────────────────────────────
// The importer kept each cost type as its own row sharing a row_number, so one
// workbook line arrives here as up to three rows. These put it back together.

export interface CostTypeRow {
  cost_type: string | null
  unit_cost: number | string
}

/**
 * Which bucket a historical row belongs in.
 *
 * 'other' and null fall in with labor: there are 58 such rows out of 12,234, and
 * inspection shows them to be removal and demolition work ("Remove baseboard",
 * "Remove sliding glass door"), which JDC prices as labor. Folding them in keeps
 * unit_cost = labor + material + sub exact rather than introducing a fourth bucket
 * for a rounding error's worth of rows.
 */
export function bucketForCostType(costType: string | null): BreakdownField {
  if (costType === 'materials') return 'material_cost'
  if (costType === 'subcontract') return 'sub_cost'
  return 'labor_cost'
}

/** Rolls the rows of one workbook line into buckets plus their total. */
export function mergeCostTypeRows(rows: CostTypeRow[]): CostBreakdown & { unit_cost: number } {
  const merged: CostBreakdown = { labor_cost: null, material_cost: null, sub_cost: null }

  for (const row of rows) {
    const amount = toCost(row.unit_cost)
    if (amount === null) continue
    const bucket = bucketForCostType(row.cost_type)
    merged[bucket] = round((merged[bucket] ?? 0) + amount)
  }

  return { ...merged, unit_cost: unitCostFrom(merged) ?? 0 }
}
