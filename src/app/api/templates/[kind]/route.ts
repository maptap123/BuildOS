import { NextResponse } from 'next/server'
import { authorizeTemplates } from '@/lib/templates/auth'
import { saveJobAsTemplate } from '@/lib/templates/jobTemplates'

type Params = { params: Promise<{ kind: string }> }

// POST /api/templates/job       { name, description?, from_job_id?, sections? }   blank, or snapshot of a job
// POST /api/templates/activity  { name, description? }
// POST /api/templates/document  { name, kind, body? }
export async function POST(request: Request, { params }: Params) {
  const { kind } = await params
  const auth = await authorizeTemplates('edit')
  if ('error' in auth) return auth.error
  const { admin, userId } = auth

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  if (kind === 'job') {
    if (body.from_job_id) {
      const sections = {
        schedule: body.sections?.schedule ?? true,
        tasks: body.sections?.tasks ?? true,
        selections: body.sections?.selections ?? true,
      }
      try {
        const res = await saveJobAsTemplate(admin, {
          jobId: body.from_job_id, name, userId, description: body.description ?? null, sections,
        })
        return NextResponse.json(res, { status: 201 })
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 })
      }
    }
    const { data, error } = await admin.from('job_templates')
      .insert({ name, description: body.description ?? null, created_by: userId }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (kind === 'activity') {
    const { data, error } = await admin.from('activity_templates')
      .insert({ name, description: body.description ?? null, created_by: userId }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (kind === 'document') {
    const { data, error } = await admin.from('document_templates')
      .insert({ name, kind: body.kind ?? 'other', body: body.body ?? '', created_by: userId }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown template kind' }, { status: 404 })
}
