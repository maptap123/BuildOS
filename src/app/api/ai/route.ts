import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'
import {
  summarizeDailyLog,
  estimateFromDescription,
  generateEstimateLines,
  generateEstimateFromComps,
  type CompEstimate,
  type CompLine,
} from '@/lib/ai/claude'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canUseAi = await hasModulePermOrAdmin(createAdminClient(), user.id, 'ai', 'can_view')
  if (!canUseAi) return NextResponse.json({ error: 'AI module access not granted' }, { status: 403 })

  const body = await request.json()
  const { action, text } = body

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  try {
    if (action === 'summarize_log') {
      if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
      const result = await summarizeDailyLog(text)
      return NextResponse.json({ result })
    } else if (action === 'estimate') {
      if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
      const result = await estimateFromDescription(text)
      return NextResponse.json({ result })
    } else if (action === 'generate_estimate_lines') {
      const { scope, project_type, square_footage, location } = body
      const lines = await generateEstimateLines(scope ?? text, { project_type, square_footage, location })
      return NextResponse.json({ result: lines })
    } else if (action === 'generate_from_comps') {
      const { scope, comp_ids, project_type, square_footage, location } = body

      if (!scope || typeof scope !== 'string' || !scope.trim()) {
        return NextResponse.json({ error: 'scope is required' }, { status: 400 })
      }
      if (!Array.isArray(comp_ids) || comp_ids.length === 0) {
        return NextResponse.json({ error: 'comp_ids must contain at least one estimate' }, { status: 400 })
      }

      const comps = await loadComps(createAdminClient(), comp_ids.slice(0, MAX_COMPS))
      if (comps.length === 0) {
        return NextResponse.json({ error: 'None of the selected comparables could be loaded' }, { status: 404 })
      }

      const lines = await generateEstimateFromComps(scope.trim(), comps, {
        project_type, square_footage, location,
      })
      return NextResponse.json({
        result: lines,
        comps_used: comps.map(c => ({ job_name: c.job_name, line_count: c.lines.length })),
      })
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI error' }, { status: 500 })
  }
}

/**
 * How many comparable estimates can be sent to the model at once. Each carries its full
 * line detail, so this bounds prompt size as much as it bounds user choice.
 */
const MAX_COMPS = 5

/** Cap on line items pulled per comp, largest by cost first, to keep the prompt bounded. */
const MAX_LINES_PER_COMP = 200

/** Loads the selected historical estimates with their line items, ready for the prompt. */
async function loadComps(
  admin: ReturnType<typeof createAdminClient>,
  compIds: string[]
): Promise<CompEstimate[]> {
  const { data: estimates } = await admin
    .from('historical_estimates')
    .select('id, job_id, file_name, source_year, total_cost, areas, jobs(name)')
    .in('id', compIds)
    .eq('parse_status', 'ok')

  if (!estimates || estimates.length === 0) return []

  const { data: lines } = await admin
    .from('historical_estimate_lines')
    .select('historical_estimate_id, cost_code, division_num, division_name, cost_type, area, description, uom, quantity, unit_cost, markup_pct, total_cost')
    .in('historical_estimate_id', estimates.map(e => e.id))
    .order('total_cost', { ascending: false })

  const linesByEstimate = new Map<string, CompLine[]>()
  for (const row of lines ?? []) {
    const bucket = linesByEstimate.get(row.historical_estimate_id) ?? []
    if (bucket.length >= MAX_LINES_PER_COMP) continue
    bucket.push({
      cost_code:     row.cost_code,
      division_num:  row.division_num,
      division_name: row.division_name,
      cost_type:     row.cost_type,
      area:          row.area,
      description:   row.description,
      uom:           row.uom,
      quantity:      Number(row.quantity),
      unit_cost:     Number(row.unit_cost),
      markup_pct:    Number(row.markup_pct),
    })
    linesByEstimate.set(row.historical_estimate_id, bucket)
  }

  return estimates
    .map(e => {
      // Fall back to the workbook name when a record is not linked to a job.
      const job = e.jobs as unknown as { name: string } | null
      return {
        job_id:      e.job_id as string | null,
        job_name:    job?.name ?? (e.file_name as string),
        source_year: e.source_year as string | null,
        total_cost:  Number(e.total_cost),
        areas:       (e.areas as string[]) ?? [],
        lines:       linesByEstimate.get(e.id) ?? [],
      }
    })
    .filter(c => c.lines.length > 0)
}
