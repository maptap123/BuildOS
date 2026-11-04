import { NextResponse } from 'next/server'
import { authorizeTemplates } from '@/lib/templates/auth'
import { DEFAULT_WORK_DAYS } from '@/lib/templates/workdays'

type Params = { params: Promise<{ kind: string; id: string }> }
/* eslint-disable @typescript-eslint/no-explicit-any */

const TABLES: Record<string, string> = { job: 'job_templates', activity: 'activity_templates', document: 'document_templates' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const int = (v: unknown, min: number, fallback: number | null) => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : Math.max(min, Math.trunc(n))
}
const names = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []

export async function GET(_req: Request, { params }: Params) {
  const { kind, id } = await params
  const table = TABLES[kind]
  if (!table) return NextResponse.json({ error: 'Unknown template kind' }, { status: 404 })
  const auth = await authorizeTemplates('view')
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { data, error } = await admin.from(table).select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (kind !== 'job') return NextResponse.json(data)

  const [items, tasks, sels] = await Promise.all([
    admin.from('job_template_schedule_items').select('*').eq('template_id', id).order('sort_order'),
    admin.from('job_template_tasks').select('*').eq('template_id', id).order('sort_order'),
    admin.from('job_template_selections').select('*').eq('template_id', id).order('sort_order'),
  ])
  const e = [items, tasks, sels].find(r => r.error)?.error
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ...data, schedule_items: items.data, tasks: tasks.data, selections: sels.data })
}

// PUT replaces the template: its own fields and, for job templates, every child row.
export async function PUT(request: Request, { params }: Params) {
  const { kind, id } = await params
  const table = TABLES[kind]
  if (!table) return NextResponse.json({ error: 'Unknown template kind' }, { status: 404 })
  const auth = await authorizeTemplates('edit')
  if ('error' in auth) return auth.error
  const { admin } = auth

  const b = await request.json().catch(() => null)
  if (!b || !String(b.name ?? '').trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const now = new Date().toISOString()

  if (kind === 'activity') {
    const steps = (Array.isArray(b.steps) ? b.steps : []).map((s: any) => ({
      kind: String(s.kind ?? 'follow-up'),
      title: String(s.title ?? ''),
      offset_days: int(s.offset_days, 0, 0),
      subject: str(s.subject),
      body: str(s.body),
      assign_to: String(s.assign_to ?? 'salesperson'),
    }))
    const { error } = await admin.from(table).update({
      name: String(b.name).trim(), description: str(b.description), steps, updated_at: now,
    }).eq('id', id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (kind === 'document') {
    const { error } = await admin.from(table).update({
      name: String(b.name).trim(), kind: b.kind ?? 'other', body: String(b.body ?? ''), is_default: !!b.is_default, updated_at: now,
    }).eq('id', id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  // ---- job template ----
  const { data: exists } = await admin.from('job_templates').select('id').eq('id', id).maybeSingle()
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Client-made rows carry temporary ids; give every row a real uuid and rewrite references.
  const remap = new Map<string, string>()
  const real = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null
    if (UUID.test(v)) return v
    if (!remap.has(v)) remap.set(v, crypto.randomUUID())
    return remap.get(v)!
  }
  const inItems: any[] = Array.isArray(b.schedule_items) ? b.schedule_items : []
  const inTasks: any[] = Array.isArray(b.tasks) ? b.tasks : []
  const inSels: any[] = Array.isArray(b.selections) ? b.selections : []
  const itemIds = new Set(inItems.map(i => real(i.id)))
  const taskIds = new Set(inTasks.map(t => real(t.id)))

  const itemRows = inItems.filter(i => str(i.title)).map((i, n) => {
    const myId = real(i.id) ?? crypto.randomUUID()
    return {
      id: myId, template_id: id,
      title: String(i.title).trim(), notes: str(i.notes),
      start_offset: int(i.start_offset, 0, 0)!, duration: int(i.duration, 1, 1)!,
      item_type: i.item_type === 'milestone' ? 'milestone' : 'phase',
      color: str(i.color), trade: str(i.trade), assignees: names(i.assignees),
      predecessors: (Array.isArray(i.predecessors) ? i.predecessors : [])
        .map((p: any) => ({ item_id: real(p.item_id), type: ['FS', 'SS', 'FF', 'SF'].includes(p.type) ? p.type : 'FS', lag_days: int(p.lag_days, -10000, 0) }))
        .filter((p: any) => p.item_id && p.item_id !== myId && itemIds.has(p.item_id)),
      sort_order: n,
    }
  })
  const taskRows = inTasks.filter(t => str(t.title)).map((t, n) => {
    const myId = real(t.id) ?? crypto.randomUUID()
    const parent = real(t.parent_id)
    const link = real(t.schedule_item_id)
    return {
      id: myId, template_id: id,
      parent_id: parent && parent !== myId && taskIds.has(parent) ? parent : null,
      title: String(t.title).trim(), description: str(t.description),
      priority: ['low', 'medium', 'high', 'urgent'].includes(t.priority) ? t.priority : 'medium',
      due_offset: int(t.due_offset, 0, null), assignees: names(t.assignees),
      schedule_item_id: link && itemIds.has(link) ? link : null,
      sort_order: n,
    }
  })
  const selRows = inSels.filter(s => str(s.title)).map((s, n) => ({
    template_id: id, title: String(s.title).trim(), cost_code: str(s.cost_code), location: str(s.location),
    instructions: str(s.instructions), deadline_offset: int(s.deadline_offset, 0, null),
    vendor_names: names(s.vendor_names), sort_order: n,
  }))

  const { error: upErr } = await admin.from('job_templates').update({
    name: String(b.name).trim(), description: str(b.description), color: str(b.color),
    work_days: { ...DEFAULT_WORK_DAYS, ...(b.work_days ?? {}) },
    internal_notes: str(b.internal_notes), sub_notes: str(b.sub_notes), updated_at: now,
  }).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Children: tasks first (they point at schedule items), then re-insert in dependency order.
  for (const t of ['job_template_tasks', 'job_template_selections', 'job_template_schedule_items']) {
    const { error } = await admin.from(t).delete().eq('template_id', id)
    if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 })
  }
  for (const [t, rows] of [
    ['job_template_schedule_items', itemRows], ['job_template_tasks', taskRows], ['job_template_selections', selRows],
  ] as const) {
    if (!rows.length) continue
    const { error } = await admin.from(t).insert(rows as any[])
    if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true, schedule_items: itemRows.length, tasks: taskRows.length, selections: selRows.length })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { kind, id } = await params
  const table = TABLES[kind]
  if (!table) return NextResponse.json({ error: 'Unknown template kind' }, { status: 404 })
  const auth = await authorizeTemplates('edit')
  if ('error' in auth) return auth.error
  const { error } = await auth.admin.from(table).delete().eq('id', id)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
