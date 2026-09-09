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
 * `unitCostFrom` returns null rather than 0 for a line with no buckets at all, because 0
 * would silently zero out a hand-priced line mid-update.
 *
 * Nothing reaches `estimate_lines` in that state, though: every write path runs the line
 * through `splitOrDefault` first, so a stored line always has a split its unit cost adds
 * up to. See that function for where an unexplained price lands.
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
 * The complete split for a line about to be stored.
 *
 * Every estimate line carries one. A bare unit cost with three empty buckets is what made
 * the Schroeder estimate unreadable — the number was right, but nothing said what it was
 * made of. When the split is genuinely unknown the whole unit cost becomes material: it is
 * the only bucket that asserts nothing further about the work, where labor would imply
 * crew hours and sub would imply a subcontractor who does not exist.
 *
 * Buckets win over the unit cost whenever there are any, matching `withDerivedUnitCost`.
 */
export function splitOrDefault(
  unitCost: unknown,
  b?: Partial<CostBreakdown> | null
): CostBreakdown {
  if (b && hasBreakdown(b)) {
    return {
      labor_cost:    toCost(b.labor_cost),
      material_cost: toCost(b.material_cost),
      sub_cost:      toCost(b.sub_cost),
    }
  }
  return { labor_cost: null, material_cost: round(toCost(unitCost) ?? 0), sub_cost: null }
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

/**
 * The unit cost to display and to total with.
 *
 * One helper because the row and the Summary panel used to read different fields — the
 * row showed the buckets' sum while the totals added up the stored `unit_cost`. They
 * agree now and the database enforces it, but nothing should be reading two sources for
 * one number.
 */
export function lineUnitCost(line: Partial<CostBreakdown> & { unit_cost: number }): number {
  return unitCostFrom(line) ?? line.unit_cost
}

/** True when an update changes the price, and so needs the stored buckets to reconcile. */
export function touchesPricing(updates: Record<string, unknown>): boolean {
  return BREAKDOWN_FIELDS.some(f => f in updates) || 'unit_cost' in updates
}

/**
 * Reconciles a partial line update against what is stored, so unit_cost and the buckets
 * can never be written out of step. Both PATCH endpoints go through here — the query-param
 * one and the `[id]` one — because two copies of this rule is how they drift.
 *
 * - buckets in the update → unit_cost is recomputed from the merged three
 * - only a unit cost → the stored split keeps the price if it has one, otherwise the
 *   number becomes material. unit_cost is a sum, never an independently typed field.
 */
export function reconcileLineUpdate(
  updates: Record<string, unknown>,
  current?: Partial<CostBreakdown>
): Record<string, unknown> {
  if (BREAKDOWN_FIELDS.some(f => f in updates)) {
    return withDerivedUnitCost(updates, current)
  }
  if ('unit_cost' in updates) {
    const split = splitOrDefault(updates.unit_cost, current)
    return { ...updates, ...split, unit_cost: unitCostFrom(split) ?? 0 }
  }
  return updates
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
