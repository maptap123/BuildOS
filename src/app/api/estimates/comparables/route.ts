import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/estimates/comparables
//
// Step 1 of AI estimate generation: given a scope description, return the past jobs
// whose estimates most resemble it, so the estimator can pick which ones to build from.
//
// Body: { scope: string, limit?: number }

export interface ComparableJob {
  historical_estimate_id: string
  job_id:      string | null
  job_name:    string
  file_name:   string
  web_url:     string | null
  source_year: string | null
  city:        string | null
  line_count:  number
  total_cost:  number
  areas:       string[]
  divisions:   string[]
  score:       number
  /**
   * How strong this match is relative to the best one in the same result set.
   * The raw score has no calibrated scale — a perfect match lands around 0.1 — so
   * showing it as a percentage would make good matches look bad. Callers should
   * display this band instead.
   */
  match_strength: 'best' | 'strong' | 'possible'
  /** Largest divisions by cost, so the user can see at a glance what drove the job. */
  top_divisions: { division: string; total: number }[]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const scope = typeof body.scope === 'string' ? body.scope.trim() : ''
  if (!scope) return NextResponse.json({ error: 'scope is required' }, { status: 400 })

  const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 25)

  const { data: matches, error } = await admin.rpc('match_historical_estimates', {
    scope_text:  scope,
    match_limit: limit,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (matches ?? []) as Omit<ComparableJob, 'top_divisions' | 'match_strength'>[]
  if (rows.length === 0) {
    return NextResponse.json({ comparables: [], message: 'No past estimates matched this scope' })
  }

  const byDivision = await divisionTotals(admin, rows.map(r => r.historical_estimate_id))

  // Rows come back ordered by score, so the first is the ceiling for this scope.
  const topScore = Number(rows[0].score) || 1

  const comparables: ComparableJob[] = rows.map((r, i) => {
    const score = Number(r.score)
    const relative = score / topScore
    return {
      ...r,
      total_cost:     Number(r.total_cost),
      score,
      match_strength: i === 0 ? 'best' : relative >= 0.6 ? 'strong' : 'possible',
      top_divisions:  byDivision.get(r.historical_estimate_id) ?? [],
    }
  })

  return NextResponse.json({ comparables })
}

/** Cost per division for each estimate, largest first, capped at the top few. */
async function divisionTotals(
  admin: ReturnType<typeof createAdminClient>,
  estimateIds: string[]
): Promise<Map<string, { division: string; total: number }[]>> {
  const { data } = await admin
    .from('historical_estimate_lines')
    .select('historical_estimate_id, division_num, division_name, total_cost')
    .in('historical_estimate_id', estimateIds)

  const totals = new Map<string, Map<string, number>>()

  for (const row of data ?? []) {
    if (!row.division_num) continue
    const key = `${row.division_num} ${row.division_name ?? ''}`.trim()
    const forEstimate = totals.get(row.historical_estimate_id) ?? new Map<string, number>()
    forEstimate.set(key, (forEstimate.get(key) ?? 0) + Number(row.total_cost ?? 0))
    totals.set(row.historical_estimate_id, forEstimate)
  }

  const result = new Map<string, { division: string; total: number }[]>()
  for (const [estimateId, divisions] of totals) {
    result.set(
      estimateId,
      [...divisions.entries()]
        .map(([division, total]) => ({ division, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    )
  }
  return result
}
