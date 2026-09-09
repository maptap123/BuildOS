/**
 * Cost code divisions are the estimate's phases
 * =============================================
 * JDC's estimates group by cost book division — "01 Plans and Permits", "02 Tear-Out and
 * Demolition", "03 Excavation and Grading" — and nothing else. Fixer used to be handed a
 * free-text `phase` field and it did what a model does with one: it invented a grouping
 * per estimate. The Schroeder estimate came back organised into "Whole House Demo",
 * "Kitchen Demo", "Walls / Framing", "Bathroom / Mud Room" — a sensible-looking scheme
 * that matches no other JDC estimate, so two estimates could not be compared side by side
 * and the phase subtotals meant nothing across jobs.
 *
 * So the phase is not a field anyone types. It is derived from the line's cost code, here,
 * and both tool dispatchers plus the builder's catalog picker go through this one function.
 *
 * The names below are the cost book's own (`cost_catalog.division_name`). The imported
 * workbooks spell several of them differently — `historical_estimate_lines` says "Site
 * Preparation" for 02, "Kitchen Cabinets" for 21 — so a line's own `division_name` is
 * deliberately NOT trusted: whichever table a line was cited from, it lands in the same
 * group under the same label.
 */

/** The cost book's divisions, keyed by the two-character division number. */
export const DIVISION_NAMES: Record<string, string> = {
  '01': 'Plans and Permits',
  '02': 'Tear-Out and Demolition',
  '03': 'Excavation and Grading',
  '04': 'Concrete',
  '05': 'Masonry',
  '06': 'Floor Framing',
  '07': 'Wall Framing',
  '08': 'Roof Framing',
  '09': 'Roofing and Flashing',
  '10': 'Exterior Trim and Decks',
  '11': 'Siding',
  '12': 'Exterior Doors and Trim',
  '13': 'Windows and Trim',
  '14': 'Plumbing',
  '15': 'Heating and Cooling',
  '16': 'Electrical',
  '17': 'Insulation',
  '18': 'Interior Wall Coverings',
  '19': 'Ceiling Coverings',
  '20': 'Millwork and Trim',
  '21': 'Cabinets and Appliances',
  '22': 'Specialties',
  '23': 'Floor Covering',
  '24': 'Painting',
  '25': 'Clean-Up',
}

/** Where a line with no usable cost code goes. Sorts last, after every numbered group. */
export const UNASSIGNED_PHASE = 'Unassigned'

/**
 * The division number a cost code belongs to, or null.
 *
 * A code is `NN.NNNN` or `NN.NNNN.XXX` — the division is the part before the first dot.
 * The shell/assembly codes (`S1.0000.`, `S2.…`) are the exception: their prefix is not a
 * division at all, which is why a stored `division_num` always wins over this.
 */
export function divisionFromCostCode(code: string | null | undefined): string | null {
  const head = (code ?? '').trim().split('.')[0]
  return /^\d{2}$/.test(head) ? head : null
}

/**
 * The phase label for a line: `"02 Tear-Out and Demolition"`.
 *
 * `divisionNum` is the column both `cost_catalog` and `historical_estimate_lines` carry,
 * and it is preferred because it is right for the shell codes too. `costCode` is the
 * fallback for a line that resolved to nothing but still cited a code.
 */
export function divisionPhase(
  divisionNum?: string | null,
  costCode?: string | null,
  fallbackName?: string | null
): string {
  const num = (divisionNum ?? '').trim() || divisionFromCostCode(costCode)
  if (!num) return UNASSIGNED_PHASE

  const name: string = DIVISION_NAMES[num] || (fallbackName ?? '').trim() || 'Other'
  return `${num} ${name}`
}

/**
 * Order phase groups the way the cost book runs — 01 through 25, Unassigned last.
 * Every label starts with its division number, so a plain string compare is the order,
 * and 'U' sorting after '0'-'9' puts Unassigned at the bottom for free.
 */
export function comparePhases(a: string, b: string): number {
  return a.localeCompare(b, 'en')
}
