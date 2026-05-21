import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

function categoryForLine(phase: string | null, costCode: string | null): string {
  if (phase?.trim()) return phase.trim()
  if (costCode?.trim()) return `Cost Code ${costCode.trim()}`
  return 'Estimate'
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  const body = await request.json().catch(() => ({}))
  const { job_id, estimate_id } = body
  if (!job_id || !estimate_id) {
    return NextResponse.json({ error: 'job_id and estimate_id are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify job exists
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .select('id')
    .eq('id', job_id)
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Load estimate lines
  const { data: lines, error: linesErr } = await admin
    .from('estimate_lines')
    .select('*')
    .eq('estimate_id', estimate_id)
    .order('sort_order')
    .order('created_at')
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: 'Estimate has no lines to import' }, { status: 400 })
  }

  // Check for existing budget lines
  const { count: existingCount } = await admin
    .from('budget_lines')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job_id)

  if ((existingCount ?? 0) > 0 && !force) {
    return NextResponse.json(
      { existing_count: existingCount, message: 'Job already has budget lines. Pass ?force=true to overwrite.' },
      { status: 409 },
    )
  }

  if ((existingCount ?? 0) > 0 && force) {
    await admin.from('budget_lines').delete().eq('job_id', job_id)
  }

  const budgetRows = lines.map((line) => {
    const rawCost = Number(line.quantity ?? 1) * Number(line.unit_cost ?? 0)
    return {
      job_id,
      cost_code: line.cost_code?.trim() || 'EST',
      category: categoryForLine(line.phase, line.cost_code),
      description: line.description.trim(),
      phase: line.phase?.trim() || null,
      status: 'approved',
      original_budget: rawCost,
      revised_budget: rawCost,
      committed_cost: 0,
      forecast_cost: rawCost,
      notes: `Imported from estimate ${estimate_id}`,
      created_by: user.id,
    }
  })

  const { data: created, error: insertErr } = await admin
    .from('budget_lines')
    .insert(budgetRows)
    .select()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ imported: created?.length ?? budgetRows.length, lines: created }, { status: 201 })
}
