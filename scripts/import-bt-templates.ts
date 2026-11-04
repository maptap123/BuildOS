/**
 * Buildertrend -> BuildOS: import JDC's templates from the bt-export/templates dumps.
 *
 *   - 4 Job Templates (schedule items, tasks, selections)   -> job_templates + job_template_*
 *   - Lead Activity templates                               -> activity_templates
 *   - Standard Lien Waiver                                  -> document_templates (kind lien_waiver)
 *
 * Insert-only + idempotent: a template whose bt_template_id already exists is skipped, so edits
 * made in BuildOS are never overwritten by a re-run.
 *
 *   npx tsx scripts/import-bt-templates.ts            # dry run (counts only)
 *   npx tsx scripts/import-bt-templates.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { DEFAULT_WORK_DAYS, snapToWorkday, workdaysBetween, workdaySpan } from '../src/lib/templates/workdays'

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) { // .env.local is CRLF
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}
loadEnvFile(join(process.cwd(), '.env.local'))

const APPLY = process.argv.includes('--apply')
const DIR = join(process.cwd(), 'bt-export', 'templates')
const read = (p: string) => JSON.parse(readFileSync(join(DIR, p), 'utf-8'))

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null)
const plain = (s: string | null | undefined) => (s ?? '').replace(/\s+\n/g, '\n').trim() || null

/* eslint-disable @typescript-eslint/no-explicit-any */

async function importJobTemplates() {
  const sched = read('fieldops/schedule_templates.json')
  const tasksRaw = read('fieldops/task_templates.json')
  const selsRaw = read('fieldops/job_template_selections.json')
  const info = read('fieldops/job_templates.json')

  const names: Record<string, string> = {
    Bathroom: 'Bathroom Remodel', Kitchen: 'Kitchen Remodel', NewHome: 'New Home', PostConstruction: 'Post-Construction',
  }

  for (const key of Object.keys(names)) {
    const btId = String(sched[key].templateId)
    const { data: existing } = await supabase.from('job_templates').select('id').eq('bt_template_id', btId).maybeSingle()
    if (existing) { console.log(`= ${names[key]}: already imported, skipping`); continue }

    const wd = { ...DEFAULT_WORK_DAYS, ...(sched[key].workdays ?? {}) }
    const items: any[] = sched[key].items
    const starts = items.map(i => day(i.detail.startDate.value)!).sort()
    const base = starts.length ? snapToWorkday(starts[0], wd) : null
    const off = (d: string | null) => (base && d ? workdaysBetween(base, d, wd) : null)

    // template item ids first, so predecessors / task links can refer to them
    const idByBt = new Map<string, string>()
    items.forEach(i => idByBt.set(String(i.gridRow.title.scheduleItemId), randomUUID()))

    const itemRows = items.map((i, n) => {
      const d = i.detail
      const start = day(d.startDate.value)!, end = day(d.endDate.value)!
      const preds = (d.predecessors ?? []).map((p: any) => {
        const target = p.scheduleItem?.value?.find((o: any) => o.selected)
        const type = p.linkedType?.value?.find((o: any) => o.selected)
        const tid = target && idByBt.get(String(target.id))
        if (!tid) return null
        return { item_id: tid, type: type?.id === 2 ? 'SS' : 'FS', lag_days: p.lag?.value ?? 0 }
      }).filter(Boolean)
      const notes = [d.internalNotes?.value, d.subNotes?.value, d.allNotes?.value].find((x: string) => x && x.trim())
      return {
        id: idByBt.get(String(i.gridRow.title.scheduleItemId))!,
        title: i.gridRow.title.title,
        notes: plain(notes),
        start_offset: off(start) ?? 0,
        duration: workdaySpan(start, end, wd),
        item_type: 'phase',
        color: i.gridRow.title.color ?? null,
        assignees: (i.gridRow.assignees ?? []).map((a: any) => a.name),
        predecessors: preds,
        sort_order: n,
        bt_id: String(i.gridRow.title.scheduleItemId),
      }
    })

    const tasks: any[] = (tasksRaw[key].raw.tasks ?? []).filter((t: any) => !t.isDeleted)
    const taskIdByBt = new Map<string, string>()
    tasks.forEach(t => taskIdByBt.set(String(t.taskId), randomUUID()))
    const taskRows = tasks.map((t, n) => ({
      id: taskIdByBt.get(String(t.taskId))!,
      parent_id: t.ancestorId ? taskIdByBt.get(String(t.ancestorId)) ?? null : null,
      title: t.title,
      description: plain(t.descriptionPlainText),
      due_offset: off(day(t.endDate)) == null ? null : Math.max(0, off(day(t.endDate))!),
      assignees: (t.assignments ?? []).map((a: any) => a.name),
      schedule_item_id: t.linkedSchedule?.scheduleId ? idByBt.get(String(t.linkedSchedule.scheduleId)) ?? null : null,
      sort_order: n,
      bt_id: String(t.taskId),
    }))

    const seen = new Set<number>()
    const selRows: any[] = []
    for (const page of selsRaw[key].pages ?? []) {
      for (const s of page?.data?.data ?? []) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        selRows.push({
          title: s.title.title,
          cost_code: s.category || null,
          location: s.location || null,
          instructions: plain(s.instructions),
          vendor_names: s.vendors?.names ?? [],
          sort_order: selRows.length,
          bt_id: String(s.id),
        })
      }
    }

    const summary = info?.summary?.data ?? info?.summary
    console.log(`+ ${names[key]}: ${itemRows.length} schedule items, ${taskRows.length} tasks, ${selRows.length} selections`)
    if (!APPLY) continue

    const { data: tpl, error } = await supabase.from('job_templates').insert({
      name: names[key], work_days: wd, bt_template_id: btId,
      description: summary && typeof summary === 'object' ? null : null,
    }).select('id').single()
    if (error) throw error
    const tid = tpl.id
    const chunk = async (table: string, rows: any[]) => {
      for (let i = 0; i < rows.length; i += 200) {
        const { error: e } = await supabase.from(table).insert(rows.slice(i, i + 200).map(r => ({ ...r, template_id: tid })))
        if (e) throw new Error(`${table}: ${e.message}`)
      }
    }
    await chunk('job_template_schedule_items', itemRows)
    await chunk('job_template_tasks', taskRows)
    await chunk('job_template_selections', selRows)
  }
}

async function importActivityTemplates() {
  const data = read('sales/lead_activity_templates_slim.json')
  for (const [btId, t] of Object.entries<any>(data)) {
    const acts: any[] = (t.activities ?? []).slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
    if (!acts.length && !t.name) continue
    const { data: existing } = await supabase.from('activity_templates').select('id').eq('bt_template_id', btId).maybeSingle()
    if (existing) { console.log(`= ${t.name}: already imported, skipping`); continue }
    const first = acts.length ? day(acts[0].date)! : null
    const steps = acts.map(a => {
      const email = a.email_other && a.email_other.subject !== undefined ? a.email_other : null
      return {
        kind: String((a.type ?? ['Follow-up'])[0]).toLowerCase(),
        title: a.grid?.title ?? (a.type ?? [''])[0],
        offset_days: first ? Math.max(0, Math.round((Date.parse(day(a.date)!) - Date.parse(first)) / 86_400_000)) : 0,
        subject: email?.subject ?? null,
        body: email?.body ?? (a.details_body || null),
        assign_to: 'salesperson',
      }
    })
    console.log(`+ Activity template "${t.name}": ${steps.length} steps`)
    if (!APPLY) continue
    const { error } = await supabase.from('activity_templates').insert({
      name: t.name, description: t.description || null, steps, bt_template_id: btId,
    })
    if (error) throw error
  }
}

function tiptapToText(node: any): string {
  if (!node) return ''
  switch (node.type) {
    case 'text': return node.text ?? ''
    case 'hardBreak': return '\n'
    case 'templateVariable': return `{{${node.attrs.templateKey}}}`
    case 'orderedList':
      return (node.content ?? []).map((li: any, i: number) => `${(node.attrs?.start ?? 1) + i}. ${tiptapToText(li).trim()}`).join('\n') + '\n\n'
    case 'bulletList':
      return (node.content ?? []).map((li: any) => `- ${tiptapToText(li).trim()}`).join('\n') + '\n\n'
    case 'paragraph': return (node.content ?? []).map(tiptapToText).join('') + '\n\n'
    default: return (node.content ?? []).map(tiptapToText).join('')
  }
}

async function importLienWaiver() {
  const raw = read('sales/lien_waiver_form_69475.json').data
  const { data: existing } = await supabase.from('document_templates').select('id').eq('bt_template_id', String(raw.id)).maybeSingle()
  if (existing) { console.log('= Lien waiver: already imported, skipping'); return }
  const body = tiptapToText(JSON.parse(raw.description).content).replace(/ \n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  console.log(`+ Document template "${raw.title}" (${body.length} chars)`)
  if (!APPLY) return
  const { error } = await supabase.from('document_templates').insert({
    kind: 'lien_waiver', name: raw.title, body, is_default: !!raw.isDefault, bt_template_id: String(raw.id),
  })
  if (error) throw error
}

async function main() {
  console.log(APPLY ? 'APPLY mode' : 'DRY RUN (pass --apply to write)')
  await importJobTemplates()
  await importActivityTemplates()
  await importLienWaiver()
}
main().catch(e => { console.error(e); process.exit(1) })
