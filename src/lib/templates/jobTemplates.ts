import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addWorkdays, snapToWorkday, workdaysBetween, workdaySpan, DEFAULT_WORK_DAYS, type WorkDays,
} from './workdays'

export type Predecessor = { item_id: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag_days: number }

export interface TemplateScheduleItem {
  id: string
  title: string
  notes: string | null
  start_offset: number
  duration: number
  item_type: 'phase' | 'milestone'
  color: string | null
  trade: string | null
  assignees: string[]
  predecessors: Predecessor[]
  sort_order: number
}
export interface TemplateTask {
  id: string
  parent_id: string | null
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  due_offset: number | null
  assignees: string[]
  schedule_item_id: string | null
  sort_order: number
}
export interface TemplateSelection {
  id: string
  title: string
  cost_code: string | null
  location: string | null
  instructions: string | null
  deadline_offset: number | null
  vendor_names: string[]
  sort_order: number
}

export type ApplySections = { schedule: boolean; tasks: boolean; selections: boolean }
export type ApplyResult = { schedule_items: number; tasks: number; selections: number; unmatched_assignees: string[] }

/** full_name (lowercased) -> user id, for turning template assignee names into real users. */
async function userIdsByName(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await admin.from('users').select('id, full_name').eq('is_active', true)
  const map = new Map<string, string>()
  for (const u of (data ?? []) as { id: string; full_name: string | null }[]) {
    const key = u.full_name?.trim().toLowerCase()
    if (key && !map.has(key)) map.set(key, u.id)
  }
  return map
}

export async function applyJobTemplate(
  admin: SupabaseClient,
  opts: { templateId: string; jobId: string; startDate: string; userId: string; sections: ApplySections },
): Promise<ApplyResult> {
  const { templateId, jobId, startDate, userId, sections } = opts

  const { data: tpl, error: tplErr } = await admin.from('job_templates').select('*').eq('id', templateId).single()
  if (tplErr || !tpl) throw new Error('Template not found')
  const wd = { ...DEFAULT_WORK_DAYS, ...(tpl.work_days ?? {}) } as WorkDays
  const day0 = snapToWorkday(startDate, wd)
  const users = await userIdsByName(admin)
  const unmatched = new Set<string>()
  const resolve = (names: string[]): string | null => {
    let first: string | null = null
    for (const n of names) {
      const id = users.get(n.trim().toLowerCase())
      if (id) first ??= id
      else unmatched.add(n)
    }
    return first
  }

  const result: ApplyResult = { schedule_items: 0, tasks: 0, selections: 0, unmatched_assignees: [] }
  const itemIdMap = new Map<string, string>() // template item id -> new schedule_items.id

  if (sections.schedule || sections.tasks) {
    const { data: items } = await admin
      .from('job_template_schedule_items').select('*').eq('template_id', templateId).order('sort_order')
    const tItems = (items ?? []) as TemplateScheduleItem[]

    // Schedule items are also needed (as link targets) when only tasks are applied -- but then we
    // don't create them, so task->schedule links are simply dropped.
    if (sections.schedule && tItems.length) {
      const { data: last } = await admin
        .from('schedule_items').select('sort_order').eq('job_id', jobId)
        .order('sort_order', { ascending: false }).limit(1)
      const base = (last?.[0]?.sort_order ?? -1) + 1

      const rows = tItems.map((it, i) => {
        const start = addWorkdays(day0, it.start_offset, wd)
        return {
          job_id: jobId,
          title: it.title,
          description: it.notes,
          status: 'not_started',
          type: it.item_type,
          start_date: start,
          end_date: addWorkdays(start, it.duration - 1, wd),
          all_day: true,
          assigned_user_id: resolve(it.assignees),
          sort_order: base + i,
          trade: it.trade,
          color: it.color,
          created_by: userId,
        }
      })
      const { data: created, error } = await admin.from('schedule_items').insert(rows).select('id')
      if (error) throw new Error(`Schedule: ${error.message}`)
      // insert().select() returns rows in insert order
      tItems.forEach((it, i) => itemIdMap.set(it.id, created![i].id))
      result.schedule_items = created!.length

      const preds = tItems.flatMap(it =>
        (it.predecessors ?? [])
          .filter(p => itemIdMap.has(p.item_id) && p.item_id !== it.id)
          .map(p => ({
            job_id: jobId,
            item_id: itemIdMap.get(it.id)!,
            predecessor_id: itemIdMap.get(p.item_id)!,
            type: p.type,
            lag_days: p.lag_days ?? 0,
            created_by: userId,
          })),
      )
      if (preds.length) {
        const { error: pErr } = await admin.from('schedule_item_predecessors').insert(preds)
        if (pErr) throw new Error(`Predecessors: ${pErr.message}`)
      }
    }
  }

  if (sections.tasks) {
    const { data: tasks } = await admin
      .from('job_template_tasks').select('*').eq('template_id', templateId).order('sort_order')
    const tTasks = (tasks ?? []) as TemplateTask[]
    const titleById = new Map(tTasks.map(t => [t.id, t.title]))
    if (tTasks.length) {
      const rows = tTasks.map(t => ({
        job_id: jobId,
        title: t.title,
        description: [t.parent_id ? `Part of: ${titleById.get(t.parent_id)}` : null, t.description]
          .filter(Boolean).join('\n') || null,
        status: 'todo',
        priority: t.priority,
        assigned_to: resolve(t.assignees),
        due_date: t.due_offset == null ? null : addWorkdays(day0, t.due_offset, wd),
        schedule_item_id: t.schedule_item_id ? itemIdMap.get(t.schedule_item_id) ?? null : null,
        tags: [] as string[],
        created_by: userId,
      }))
      const { error } = await admin.from('tasks').insert(rows)
      if (error) throw new Error(`Tasks: ${error.message}`)
      result.tasks = rows.length
    }
  }

  if (sections.selections) {
    const { data: sels } = await admin
      .from('job_template_selections').select('*').eq('template_id', templateId).order('sort_order')
    const tSels = (sels ?? []) as TemplateSelection[]
    if (tSels.length) {
      const { data: last } = await admin
        .from('selections').select('sort_order').eq('job_id', jobId)
        .order('sort_order', { ascending: false }).limit(1)
      const base = (last?.[0]?.sort_order ?? -1) + 1
      const rows = tSels.map((s, i) => ({
        job_id: jobId,
        title: s.title,
        cost_code: s.cost_code,
        location: s.location,
        instructions: [s.instructions, s.vendor_names?.length ? `Vendor: ${s.vendor_names.join(', ')}` : null]
          .filter(Boolean).join('\n') || null,
        status: 'pending',
        deadline: s.deadline_offset == null ? null : addWorkdays(day0, s.deadline_offset, wd),
        sort_order: base + i,
        created_by: userId,
      }))
      const { error } = await admin.from('selections').insert(rows)
      if (error) throw new Error(`Selections: ${error.message}`)
      result.selections = rows.length
    }
  }

  result.unmatched_assignees = [...unmatched].sort()
  return result
}

/** Snapshot a job's schedule, tasks and selections into a brand-new template. */
export async function saveJobAsTemplate(
  admin: SupabaseClient,
  opts: { jobId: string; name: string; userId: string; description?: string | null; sections: ApplySections },
): Promise<{ id: string; schedule_items: number; tasks: number; selections: number }> {
  const { jobId, name, userId, sections } = opts
  const wd = DEFAULT_WORK_DAYS

  const [{ data: users }, { data: items }, { data: preds }, { data: tasks }, { data: sels }] = await Promise.all([
    admin.from('users').select('id, full_name'),
    sections.schedule || sections.tasks
      ? admin.from('schedule_items').select('*').eq('job_id', jobId).order('start_date').order('sort_order')
      : Promise.resolve({ data: [] }),
    sections.schedule
      ? admin.from('schedule_item_predecessors').select('item_id, predecessor_id, type, lag_days').eq('job_id', jobId)
      : Promise.resolve({ data: [] }),
    sections.tasks
      ? admin.from('tasks').select('*').eq('job_id', jobId).neq('status', 'archived').order('created_at')
      : Promise.resolve({ data: [] }),
    sections.selections
      ? admin.from('selections').select('*').eq('job_id', jobId).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])
  const nameById = new Map((users ?? []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name]))
  const who = (id: string | null) => {
    const n = id ? nameById.get(id) : null
    return n ? [n] : []
  }

  const sItems = (items ?? []) as { id: string; title: string; description: string | null; start_date: string; end_date: string; type: string; color: string | null; trade: string | null; assigned_user_id: string | null; sort_order: number }[]
  const tasksList = (tasks ?? []) as { id: string; title: string; description: string | null; priority: string; due_date: string | null; assigned_to: string | null; schedule_item_id: string | null }[]
  const datePool = [
    ...sItems.map(i => i.start_date),
    ...tasksList.map(t => t.due_date).filter((d): d is string => !!d),
  ].sort()
  const base = datePool.length ? snapToWorkday(datePool[0], wd) : null
  const off = (d: string) => (base ? workdaysBetween(base, d, wd) : 0)

  const { data: tpl, error: tErr } = await admin
    .from('job_templates')
    .insert({ name, description: opts.description ?? null, created_by: userId })
    .select('id').single()
  if (tErr || !tpl) throw new Error(`Template: ${tErr?.message}`)

  const idMap = new Map<string, string>()
  let nItems = 0
  if (sections.schedule && sItems.length) {
    sItems.forEach(i => idMap.set(i.id, crypto.randomUUID()))
    const rows = sItems.map((i, n) => ({
      id: idMap.get(i.id)!,
      template_id: tpl.id,
      title: i.title,
      notes: i.description,
      start_offset: off(i.start_date),
      duration: workdaySpan(i.start_date, i.end_date, wd),
      item_type: i.type === 'milestone' ? 'milestone' : 'phase',
      color: i.color,
      trade: i.trade,
      assignees: who(i.assigned_user_id),
      predecessors: (preds ?? [])
        .filter((p: { item_id: string; predecessor_id: string }) => p.item_id === i.id && idMap.has(p.predecessor_id))
        .map((p: { predecessor_id: string; type: string; lag_days: number }) => ({
          item_id: idMap.get(p.predecessor_id), type: p.type, lag_days: p.lag_days,
        })),
      sort_order: n,
    }))
    const { error } = await admin.from('job_template_schedule_items').insert(rows)
    if (error) throw new Error(`Schedule items: ${error.message}`)
    nItems = rows.length
  }

  if (sections.tasks && tasksList.length) {
    const rows = tasksList.map((t, n) => ({
      template_id: tpl.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      due_offset: t.due_date ? off(t.due_date) : null,
      assignees: who(t.assigned_to),
      schedule_item_id: t.schedule_item_id ? idMap.get(t.schedule_item_id) ?? null : null,
      sort_order: n,
    }))
    const { error } = await admin.from('job_template_tasks').insert(rows)
    if (error) throw new Error(`Tasks: ${error.message}`)
  }

  if (sections.selections && (sels ?? []).length) {
    const rows = (sels as { title: string; cost_code: string | null; location: string | null; instructions: string | null; deadline: string | null }[]).map((s, n) => ({
      template_id: tpl.id,
      title: s.title,
      cost_code: s.cost_code,
      location: s.location,
      instructions: s.instructions,
      deadline_offset: s.deadline ? off(s.deadline) : null,
      sort_order: n,
    }))
    const { error } = await admin.from('job_template_selections').insert(rows)
    if (error) throw new Error(`Selections: ${error.message}`)
  }

  return { id: tpl.id, schedule_items: nItems, tasks: tasksList.length, selections: (sels ?? []).length }
}
