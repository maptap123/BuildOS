// The live time_entries.labor_cost is a plain column — migration 011 declared it
// GENERATED, but the database never got that. So the API computes it whenever
// hours are set, using the same formula: OT falls back to the regular rate.
export function laborCost(
  regularHours: number,
  overtimeHours: number,
  hourlyRate: number | null | undefined,
  overtimeRate: number | null | undefined,
): number | null {
  if (hourlyRate == null) return null
  const total = regularHours * hourlyRate + overtimeHours * (overtimeRate ?? hourlyRate)
  return parseFloat(total.toFixed(2))
}
