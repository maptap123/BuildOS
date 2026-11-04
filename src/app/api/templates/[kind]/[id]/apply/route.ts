import { NextResponse } from 'next/server'
import { authorizeTemplates } from '@/lib/templates/auth'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { applyJobTemplate } from '@/lib/templates/jobTemplates'

type Params = { params: Promise<{ kind: string; id: string }> }

// POST /api/templates/job/[id]/apply  { job_id, start_date: 'YYYY-MM-DD', sections?: {schedule,tasks,selections} }
// Applying only ADDS rows to the job; nothing already on the job is changed or removed.
export async function POST(request: Request, { params }: Params) {
  const { kind, id } = await params
  if (kind !== 'job') return NextResponse.json({ error: 'Only job templates can be applied to a job' }, { status: 400 })
  const auth = await authorizeTemplates('view')
  if ('error' in auth) return auth.error
  const { admin, userId } = auth

  const b = await request.json().catch(() => null)
  const startDate = String(b?.start_date ?? '')
  if (!b?.job_id || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: 'job_id and start_date (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const sections = {
    schedule: b.sections?.schedule ?? true,
    tasks: b.sections?.tasks ?? true,
    selections: b.sections?.selections ?? true,
  }

  // Each section needs the matching "create" right, same as adding those rows by hand.
  const needs: [boolean, string][] = [
    [sections.schedule, 'schedule'], [sections.tasks, 'tasks'], [sections.selections, 'jobs'],
  ]
  for (const [wanted, module] of needs) {
    if (!wanted) continue
    const ok = await hasModulePermOrAdmin(admin, userId, module, module === 'jobs' ? 'can_edit' : 'can_create')
    if (!ok) return NextResponse.json({ error: `Forbidden: no access to add ${module}` }, { status: 403 })
  }

  const { data: job } = await admin.from('jobs').select('id').eq('id', b.job_id).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  try {
    const result = await applyJobTemplate(admin, { templateId: id, jobId: b.job_id, startDate, userId, sections })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
