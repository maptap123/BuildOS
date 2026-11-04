import { NextResponse } from 'next/server'
import { authorizeTemplates } from '@/lib/templates/auth'

// GET /api/templates -> every template, grouped by kind, with child counts for job templates
export async function GET() {
  const auth = await authorizeTemplates('view')
  if ('error' in auth) return auth.error
  const { admin } = auth

  const [jobs, sched, tasks, sels, activity, docs] = await Promise.all([
    admin.from('job_templates').select('id, name, description, color, updated_at').order('name'),
    admin.from('job_template_schedule_items').select('template_id'),
    admin.from('job_template_tasks').select('template_id'),
    admin.from('job_template_selections').select('template_id'),
    admin.from('activity_templates').select('id, name, description, steps, updated_at').order('name'),
    admin.from('document_templates').select('id, kind, name, is_default, updated_at').order('name'),
  ])
  const err = [jobs, sched, tasks, sels, activity, docs].find(r => r.error)?.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const count = (rows: { template_id: string }[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.template_id, (m.get(r.template_id) ?? 0) + 1)
    return m
  }
  const cs = count(sched.data), ct = count(tasks.data), cl = count(sels.data)

  return NextResponse.json({
    job: (jobs.data ?? []).map(t => ({
      ...t, schedule_items: cs.get(t.id) ?? 0, tasks: ct.get(t.id) ?? 0, selections: cl.get(t.id) ?? 0,
    })),
    activity: (activity.data ?? []).map(a => ({
      id: a.id, name: a.name, description: a.description, steps: (a.steps as unknown[]).length, updated_at: a.updated_at,
    })),
    document: docs.data ?? [],
  })
}
