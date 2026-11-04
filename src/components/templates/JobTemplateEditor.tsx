'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Play, Save, CornerDownRight } from 'lucide-react'
import {
  api, inputCls, labelCls, primaryBtn, ghostBtn,
  type JobTemplate, type SchedItem, type TplTask, type TplSelection, type Pred,
} from './ui'
import { ApplyTemplateModal } from './ApplyTemplateModal'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const csv = (a: string[]) => a.join(', ')
const unCsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
const numOrNull = (s: string) => (s === '' ? null : Math.max(0, Math.trunc(Number(s)) || 0))

export function JobTemplateEditor({ id }: { id: string }) {
  const router = useRouter()
  const [tpl, setTpl] = useState<JobTemplate | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tab, setTab] = useState<'schedule' | 'tasks' | 'selections'>('schedule')
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    try {
      setTpl(await api<JobTemplate>(`/api/templates/job/${id}`))
      setDirty(false)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load template')
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const edit = (fn: (t: JobTemplate) => JobTemplate) => { setTpl(t => (t ? fn(t) : t)); setDirty(true); setMsg(null) }

  async function save() {
    if (!tpl) return
    setSaving(true); setMsg(null)
    try {
      await api(`/api/templates/job/${id}`, { method: 'PUT', body: JSON.stringify(tpl) })
      setDirty(false)
      setMsg({ ok: true, text: 'Saved' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!tpl || !confirm(`Delete the template "${tpl.name}"? Jobs that already used it are not affected.`)) return
    try {
      await api(`/api/templates/job/${id}`, { method: 'DELETE' })
      setDirty(false)
      router.push('/templates')
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Delete failed' })
    }
  }

  const itemTitle = useMemo(() => new Map((tpl?.schedule_items ?? []).map(i => [i.id, i.title])), [tpl])

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>
  if (!tpl) return <p className="text-sm text-gray-400">Loading template…</p>

  const counts = { schedule: tpl.schedule_items.length, tasks: tpl.tasks.length, selections: tpl.selections.length }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/templates" className="text-gray-400 hover:text-navy-900"><ArrowLeft size={18} /></Link>
        <h1 className="font-display font-semibold text-navy-900 text-xl flex-1 basis-[calc(100%-2.5rem)] md:basis-0 min-w-0 md:truncate">{tpl.name || 'Template'}</h1>
        <button onClick={() => setApplying(true)} disabled={dirty} title={dirty ? 'Save your changes first' : ''} className={ghostBtn}>
          <Play size={14} /> Apply to job
        </button>
        <button onClick={save} disabled={saving || !dirty} className={primaryBtn}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}

      <div className="bg-white rounded-xl border border-border p-4 md:p-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Template name</label>
          <input className={inputCls} value={tpl.name} onChange={e => edit(t => ({ ...t, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <input className={inputCls} value={tpl.description ?? ''} onChange={e => edit(t => ({ ...t, description: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Work days (offsets below count only these days)</label>
          <div className="flex flex-wrap gap-3">
            {DAYS.map(d => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-navy-900 capitalize">
                <input
                  type="checkbox" checked={!!tpl.work_days[d]}
                  onChange={e => edit(t => ({ ...t, work_days: { ...t.work_days, [d]: e.target.checked } }))}
                />
                {d.slice(0, 3)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Internal notes</label>
          <textarea rows={2} className={inputCls} value={tpl.internal_notes ?? ''} onChange={e => edit(t => ({ ...t, internal_notes: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Notes for subs / vendors</label>
          <textarea rows={2} className={inputCls} value={tpl.sub_notes ?? ''} onChange={e => edit(t => ({ ...t, sub_notes: e.target.value }))} />
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['schedule', 'tasks', 'selections'] as const).map(k => (
          <button
            key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === k ? 'border-gold-500 text-navy-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {k} <span className="text-xs text-gray-400">({counts[k]})</span>
          </button>
        ))}
      </div>

      {tab === 'schedule' && <ScheduleSection tpl={tpl} edit={edit} />}
      {tab === 'tasks' && <TasksSection tpl={tpl} edit={edit} itemTitle={itemTitle} />}
      {tab === 'selections' && <SelectionsSection tpl={tpl} edit={edit} />}

      <div className="pt-4 border-t border-gray-100">
        <button onClick={remove} className="text-sm text-red-500 hover:text-red-700 inline-flex items-center gap-1.5">
          <Trash2 size={14} /> Delete template
        </button>
      </div>

      {applying && <ApplyTemplateModal templateId={id} onClose={() => setApplying(false)} />}
    </div>
  )
}

type EditFn = (fn: (t: JobTemplate) => JobTemplate) => void

function RowShell({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-border p-3 md:p-4 relative">
      <button onClick={onDelete} title="Remove" className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
        <Trash2 size={15} />
      </button>
      {children}
    </div>
  )
}

function ScheduleSection({ tpl, edit }: { tpl: JobTemplate; edit: EditFn }) {
  const items = tpl.schedule_items
  const patch = (id: string, p: Partial<SchedItem>) =>
    edit(t => ({ ...t, schedule_items: t.schedule_items.map(i => (i.id === id ? { ...i, ...p } : i)) }))
  const add = () =>
    edit(t => ({
      ...t,
      schedule_items: [...t.schedule_items, {
        id: crypto.randomUUID(), title: '', notes: null, start_offset: 0, duration: 1, item_type: 'phase',
        color: null, trade: null, assignees: [], predecessors: [], sort_order: t.schedule_items.length,
      }],
    }))
  const del = (id: string) =>
    edit(t => ({
      ...t,
      schedule_items: t.schedule_items.filter(i => i.id !== id)
        .map(i => ({ ...i, predecessors: i.predecessors.filter(p => p.item_id !== id) })),
      tasks: t.tasks.map(k => (k.schedule_item_id === id ? { ...k, schedule_item_id: null } : k)),
    }))

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Day 1 is the day you apply the template. A phase starting on day 1 with a 2-day duration runs days 1–2.
      </p>
      {items.map(i => (
        <RowShell key={i.id} onDelete={() => del(i.id)}>
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pr-6">
            <div className="col-span-2 md:col-span-5">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={i.title} onChange={e => patch(i.id, { title: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Starts on day</label>
              <input
                type="number" min={1} className={inputCls} value={i.start_offset + 1}
                onChange={e => patch(i.id, { start_offset: Math.max(0, (Math.trunc(Number(e.target.value)) || 1) - 1) })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Work days long</label>
              <input
                type="number" min={1} className={inputCls} value={i.duration}
                onChange={e => patch(i.id, { duration: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })}
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Assigned to (names, comma separated)</label>
              <input className={inputCls} value={csv(i.assignees)} onChange={e => patch(i.id, { assignees: unCsv(e.target.value) })} />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {i.predecessors.map((p, n) => (
              <PredRow
                key={n} pred={p} others={items.filter(o => o.id !== i.id)}
                onChange={np => patch(i.id, { predecessors: i.predecessors.map((x, k) => (k === n ? np : x)) })}
                onRemove={() => patch(i.id, { predecessors: i.predecessors.filter((_, k) => k !== n) })}
              />
            ))}
            {items.length > 1 && (
              <button
                onClick={() => {
                  const other = items.find(o => o.id !== i.id)
                  if (other) patch(i.id, { predecessors: [...i.predecessors, { item_id: other.id, type: 'FS', lag_days: 0 }] })
                }}
                className="text-xs text-gold-600 hover:text-gold-700 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add predecessor
              </button>
            )}
          </div>
        </RowShell>
      ))}
      <button onClick={add} className={ghostBtn}><Plus size={14} /> Add schedule item</button>
    </div>
  )
}

function PredRow({ pred, others, onChange, onRemove }: {
  pred: Pred; others: SchedItem[]; onChange: (p: Pred) => void; onRemove: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <CornerDownRight size={12} />
      <span>After</span>
      <select className={`${inputCls} !w-auto !py-1`} value={pred.item_id} onChange={e => onChange({ ...pred, item_id: e.target.value })}>
        {others.map(o => <option key={o.id} value={o.id}>{o.title || '(untitled)'}</option>)}
      </select>
      <select className={`${inputCls} !w-auto !py-1`} value={pred.type} onChange={e => onChange({ ...pred, type: e.target.value as Pred['type'] })}>
        <option value="FS">Finish → Start</option>
        <option value="SS">Start → Start</option>
        <option value="FF">Finish → Finish</option>
        <option value="SF">Start → Finish</option>
      </select>
      <span>lag</span>
      <input
        type="number" className={`${inputCls} !w-16 !py-1`} value={pred.lag_days}
        onChange={e => onChange({ ...pred, lag_days: Math.trunc(Number(e.target.value)) || 0 })}
      />
      <span>days</span>
      <button onClick={onRemove} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
    </div>
  )
}

function TasksSection({ tpl, edit, itemTitle }: { tpl: JobTemplate; edit: EditFn; itemTitle: Map<string, string> }) {
  const tasks = tpl.tasks
  const patch = (id: string, p: Partial<TplTask>) =>
    edit(t => ({ ...t, tasks: t.tasks.map(k => (k.id === id ? { ...k, ...p } : k)) }))
  const add = (parent: string | null) =>
    edit(t => {
      const fresh: TplTask = {
        id: crypto.randomUUID(), parent_id: parent, title: '', description: null, priority: 'medium',
        due_offset: null, assignees: [], schedule_item_id: null, sort_order: t.tasks.length,
      }
      // keep a subtask right after its parent's last descendant so the list reads as a tree
      if (!parent) return { ...t, tasks: [...t.tasks, fresh] }
      let at = t.tasks.findIndex(k => k.id === parent)
      while (at + 1 < t.tasks.length && t.tasks[at + 1].parent_id === parent) at++
      const next = [...t.tasks]
      next.splice(at + 1, 0, fresh)
      return { ...t, tasks: next }
    })
  const del = (id: string) =>
    edit(t => ({ ...t, tasks: t.tasks.filter(k => k.id !== id).map(k => (k.parent_id === id ? { ...k, parent_id: null } : k)) }))

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Due day counts work days from the template start. A task can be tied to a schedule item for reference.
      </p>
      {tasks.map(k => (
        <div key={k.id} className={k.parent_id ? 'ml-6 md:ml-10' : ''}>
          <RowShell onDelete={() => del(k.id)}>
            <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pr-6">
              <div className="col-span-2 md:col-span-5">
                <label className={labelCls}>{k.parent_id ? 'Subtask' : 'Task'}</label>
                <input className={inputCls} value={k.title} onChange={e => patch(k.id, { title: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Due on day</label>
                <input
                  type="number" min={1} className={inputCls} placeholder="—"
                  value={k.due_offset == null ? '' : k.due_offset + 1}
                  onChange={e => { const v = numOrNull(e.target.value); patch(k.id, { due_offset: v == null ? null : Math.max(0, v - 1) }) }}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Priority</label>
                <select className={inputCls} value={k.priority} onChange={e => patch(k.id, { priority: e.target.value as TplTask['priority'] })}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className={labelCls}>Assigned to</label>
                <input className={inputCls} value={csv(k.assignees)} onChange={e => patch(k.id, { assignees: unCsv(e.target.value) })} />
              </div>
              <div className="col-span-2 md:col-span-6">
                <label className={labelCls}>Linked schedule item</label>
                <select className={inputCls} value={k.schedule_item_id ?? ''} onChange={e => patch(k.id, { schedule_item_id: e.target.value || null })}>
                  <option value="">None</option>
                  {tpl.schedule_items.map(i => <option key={i.id} value={i.id}>{itemTitle.get(i.id) || '(untitled)'}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-6">
                <label className={labelCls}>Details</label>
                <input className={inputCls} value={k.description ?? ''} onChange={e => patch(k.id, { description: e.target.value })} />
              </div>
            </div>
            {!k.parent_id && (
              <button onClick={() => add(k.id)} className="mt-2 text-xs text-gold-600 hover:text-gold-700 inline-flex items-center gap-1">
                <Plus size={12} /> Add subtask
              </button>
            )}
          </RowShell>
        </div>
      ))}
      <button onClick={() => add(null)} className={ghostBtn}><Plus size={14} /> Add task</button>
    </div>
  )
}

function SelectionsSection({ tpl, edit }: { tpl: JobTemplate; edit: EditFn }) {
  const patch = (id: string, p: Partial<TplSelection>) =>
    edit(t => ({ ...t, selections: t.selections.map(s => (s.id === id ? { ...s, ...p } : s)) }))
  const add = () =>
    edit(t => ({
      ...t,
      selections: [...t.selections, {
        id: crypto.randomUUID(), title: '', cost_code: null, location: null, instructions: null,
        deadline_offset: null, vendor_names: [], sort_order: t.selections.length,
      }],
    }))
  const del = (id: string) => edit(t => ({ ...t, selections: t.selections.filter(s => s.id !== id) }))

  return (
    <div className="space-y-3">
      {tpl.selections.map(s => (
        <RowShell key={s.id} onDelete={() => del(s.id)}>
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pr-6">
            <div className="col-span-2 md:col-span-4">
              <label className={labelCls}>Selection</label>
              <input className={inputCls} value={s.title} onChange={e => patch(s.id, { title: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Category / cost code</label>
              <input className={inputCls} value={s.cost_code ?? ''} onChange={e => patch(s.id, { cost_code: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={s.location ?? ''} onChange={e => patch(s.id, { location: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Decide by day</label>
              <input
                type="number" min={1} className={inputCls} placeholder="—"
                value={s.deadline_offset == null ? '' : s.deadline_offset + 1}
                onChange={e => { const v = numOrNull(e.target.value); patch(s.id, { deadline_offset: v == null ? null : Math.max(0, v - 1) }) }}
              />
            </div>
            <div className="col-span-2 md:col-span-8">
              <label className={labelCls}>Instructions</label>
              <input className={inputCls} value={s.instructions ?? ''} onChange={e => patch(s.id, { instructions: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className={labelCls}>Vendors</label>
              <input className={inputCls} value={csv(s.vendor_names)} onChange={e => patch(s.id, { vendor_names: unCsv(e.target.value) })} />
            </div>
          </div>
        </RowShell>
      ))}
      <button onClick={add} className={ghostBtn}><Plus size={14} /> Add selection</button>
    </div>
  )
}
