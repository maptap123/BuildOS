import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCostCode } from '@/lib/estimates/costCodes'

/**
 * Allowances come from the estimate
 * =================================
 * Estimators type allowances on estimate lines as free text — "$525 Allowance" —
 * (migration 058). Selections reads those lines, so the vinyl floor's $525 shows up
 * on the job without anyone typing it twice. The text field stays as it is; the dollar
 * amount is read out of it here.
 *
 * Sync runs every time the Selections page loads. It only ever manages allowances whose
 * source is 'estimate' — one added by hand from a new selection is left alone.
 */

/**
 * The dollar amount in an allowance's text, or null when there is none to read.
 * "$525 Allowance" → 525 · "Allowance $1,250.50" → 1250.5 · "TBD" → null.
 * A `$` amount wins over a bare number, so "2 fixtures at $300" reads 300.
 */
export function parseAllowanceAmount(text: string | null | undefined): number | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const dollar = raw.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
  const bare = dollar ? null : raw.match(/([\d,]+(?:\.\d{1,2})?)/)
  const hit = dollar?.[1] ?? bare?.[1]
  if (!hit) return null
  const n = Number(hit.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

type EstimateRow = {
  id: string
  title: string | null
  version: number | null
  status: string
  client_approved_at: string | null
}

/**
 * The estimate a job's allowances come from. Estimates hang off the job's lead and a
 * lead can have several versions: the one the client approved wins, then the newest
 * sent, then the newest draft. Voided and rejected versions never count.
 */
export async function pickJobEstimate(
  admin: SupabaseClient,
  leadId: string | null,
): Promise<EstimateRow | null> {
  if (!leadId) return null
  const { data } = await admin
    .from('estimates')
    .select('id, title, version, status, client_approved_at')
    .eq('lead_id', leadId)
  const rank = (e: EstimateRow) =>
    e.client_approved_at || e.status === 'approved' ? 0 : e.status === 'sent' ? 1 : 2
  const usable = ((data ?? []) as EstimateRow[])
    .filter(e => e.status !== 'voided' && e.status !== 'rejected')
    .sort((a, b) => rank(a) - rank(b) || (b.version ?? 0) - (a.version ?? 0))
  return usable[0] ?? null
}

export type SyncResult = { estimate: EstimateRow | null; created: number; updated: number; removed: number }

/**
 * Brings the job's estimate-sourced allowances in line with the estimate's allowance
 * lines. A new allowance line gets an allowance plus a selection waiting for a choice;
 * a changed amount updates; a line whose allowance was cleared loses its allowance —
 * unless something was already picked against it or billed for it, which keeps it.
 *
 * A new estimate version has new line ids, so an allowance whose line is gone is
 * re-pointed at the new version's line with the same cost code before anything is
 * treated as removed.
 */
export async function syncAllowancesFromEstimate(
  admin: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = { estimate: null, created: 0, updated: 0, removed: 0 }

  const { data: job } = await admin.from('jobs').select('id, lead_id').eq('id', jobId).single()
  if (!job) return result
  const estimate = await pickJobEstimate(admin, job.lead_id)
  result.estimate = estimate
  if (!estimate) return result

  const [{ data: lineRows }, { data: allowanceRows }] = await Promise.all([
    admin
      .from('estimate_lines')
      .select('id, description, cost_code, allowance, sort_order')
      .eq('estimate_id', estimate.id)
      .order('sort_order'),
    admin
      .from('allowances')
      .select('id, title, cost_code, amount, source, estimate_line_id, allowance_text, needs_review')
      .eq('job_id', jobId),
  ])

  const lines = (lineRows ?? []).filter(l => (l.allowance ?? '').trim())
  const lineIds = new Set((lineRows ?? []).map(l => l.id))
  const allowances = allowanceRows ?? []
  const matched = new Set<string>()

  for (const line of lines) {
    const text = (line.allowance as string).trim()
    const amount = parseAllowanceAmount(text)
    const fields = {
      title: (line.description ?? '').trim() || 'Allowance',
      cost_code: line.cost_code?.trim() || null,
      amount: amount ?? 0,
      allowance_text: text,
      needs_review: amount === null,
      source: 'estimate' as const,
      estimate_line_id: line.id,
    }

    // Same line first; then an estimate allowance stranded by a new version, same code.
    const codeKey = normalizeCostCode(line.cost_code)
    const existing =
      allowances.find(a => a.estimate_line_id === line.id) ??
      allowances.find(a =>
        a.source === 'estimate' &&
        !matched.has(a.id) &&
        !(a.estimate_line_id && lineIds.has(a.estimate_line_id)) &&
        codeKey !== '' &&
        normalizeCostCode(a.cost_code) === codeKey)

    if (existing) {
      matched.add(existing.id)
      const changed =
        existing.title !== fields.title ||
        (existing.cost_code ?? null) !== fields.cost_code ||
        Number(existing.amount) !== fields.amount ||
        existing.allowance_text !== fields.allowance_text ||
        existing.needs_review !== fields.needs_review ||
        existing.source !== 'estimate' ||
        existing.estimate_line_id !== line.id
      if (changed) {
        await admin.from('allowances').update(fields).eq('id', existing.id)
        result.updated++
      }
      continue
    }

    const { data: created, error } = await admin
      .from('allowances')
      .insert({ job_id: jobId, ...fields, created_by: userId })
      .select('id')
      .single()
    // 23505 = another page load made it first (unique on job + estimate line).
    if (error || !created) continue
    matched.add(created.id)
    result.created++
    await admin.from('selections').insert({
      job_id: jobId,
      allowance_id: created.id,
      title: fields.title,
      cost_code: fields.cost_code,
      sort_order: line.sort_order ?? 0,
      created_by: userId,
    })
  }

  // Estimate allowances whose line no longer carries one.
  const orphans = allowances.filter(a => a.source === 'estimate' && !matched.has(a.id))
  for (const orphan of orphans) {
    const { data: sels } = await admin
      .from('selections')
      .select('id, title, selection_choices(id, is_selected)')
      .eq('allowance_id', orphan.id)
    const { count: coCount } = await admin
      .from('change_orders')
      .select('id', { count: 'exact', head: true })
      .eq('allowance_id', orphan.id)
    const picked = (sels ?? []).some(s =>
      ((s.selection_choices ?? []) as { is_selected: boolean }[]).some(c => c.is_selected))
    if (picked || (coCount ?? 0) > 0) continue

    // The placeholder the sync made (same title, no choices yet) goes with it; a
    // selection someone built by hand stays, just without an allowance.
    const placeholders = (sels ?? [])
      .filter(s => s.title === orphan.title && ((s.selection_choices ?? []) as unknown[]).length === 0)
      .map(s => s.id)
    if (placeholders.length) await admin.from('selections').delete().in('id', placeholders)
    await admin.from('allowances').delete().eq('id', orphan.id)
    result.removed++
  }

  return result
}
