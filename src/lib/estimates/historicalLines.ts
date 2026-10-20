/**
 * Writes a parsed workbook's lines onto a historical estimate, keeping line ids stable.
 *
 * Fixer cites historical lines by id (estimate_lines.source_line_id and
 * estimate_line_proposals.source_line_id, both ON DELETE SET NULL). Deleting and
 * re-inserting on every re-import silently strips those citations, so lines are matched
 * to their existing row by (row_number, cost_type, cost_code) and updated in place.
 * Only genuinely new lines are inserted, and only lines gone from the workbook are deleted.
 *
 * Relative imports only: scripts/import-estimates.ts runs this under tsx without path aliases.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedEstimateLine } from '../integrations/microsoft/estimateWorkbookParser'

const key = (row: number, type: string | null, code: string | null) => `${row}|${type ?? ''}|${code ?? ''}`

/** Returns an error message, or null on success. */
export async function syncHistoricalLines(
  db: SupabaseClient,
  estimateId: string,
  jobId: string | null,
  lines: ParsedEstimateLine[],
): Promise<string | null> {
  const existing = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('historical_estimate_lines')
      .select('id, row_number, cost_type, cost_code')
      .eq('historical_estimate_id', estimateId)
      .order('id')
      .range(from, from + 999)
    if (error) return error.message
    for (const r of data ?? []) existing.set(key(r.row_number, r.cost_type, r.cost_code), r.id)
    if ((data ?? []).length < 1000) break
  }

  const updates: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []
  for (const l of lines) {
    const row = {
      historical_estimate_id: estimateId,
      job_id:         jobId,
      row_number:     l.row_number,
      cost_code:      l.cost_code,
      division_num:   l.division_num,
      division_name:  l.division_name,
      cost_type:      l.cost_type,
      area:           l.area,
      description:    l.description,
      uom:            l.uom,
      quantity:       l.quantity,
      unit_cost:      l.unit_cost,
      total_cost:     l.total_cost,
      markup_pct:     l.markup_pct,
      internal_notes: l.internal_notes,
    }
    const k = key(l.row_number, l.cost_type, l.cost_code)
    const id = existing.get(k)
    if (id) { updates.push({ id, ...row }); existing.delete(k) }
    else inserts.push(row)
  }

  // Chunked so a large workbook does not exceed the request size limit.
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await db.from('historical_estimate_lines').upsert(updates.slice(i, i + 500), { onConflict: 'id' })
    if (error) return error.message
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db.from('historical_estimate_lines').insert(inserts.slice(i, i + 500))
    if (error) return error.message
  }
  const stale = [...existing.values()]
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await db.from('historical_estimate_lines').delete().in('id', stale.slice(i, i + 200))
    if (error) return error.message
  }
  return null
}
