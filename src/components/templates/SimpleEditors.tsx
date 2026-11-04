'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react'
import {
  api, inputCls, labelCls, primaryBtn, ghostBtn, DOC_KINDS, DOC_VARIABLES,
  type ActivityTemplate, type ActivityStep, type DocumentTemplate,
} from './ui'

/** Load / dirty / save / delete plumbing shared by the two simple editors. */
function useTemplate<T extends { name: string }>(kind: 'activity' | 'document', id: string) {
  const router = useRouter()
  const [data, setData] = useState<T | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api<T>(`/api/templates/${kind}/${id}`).then(setData).catch(e => setLoadError(e.message))
  }, [kind, id])

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const edit = useCallback((p: Partial<T>) => { setData(d => (d ? { ...d, ...p } : d)); setDirty(true); setMsg(null) }, [])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await api(`/api/templates/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      setDirty(false); setMsg({ ok: true, text: 'Saved' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!data || !confirm(`Delete "${data.name}"?`)) return
    try {
      await api(`/api/templates/${kind}/${id}`, { method: 'DELETE' })
      setDirty(false); router.push('/templates')
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Delete failed' }) }
  }

  return { data, loadError, dirty, saving, msg, edit, save, remove }
}

function Header({ title, dirty, saving, msg, onSave }: {
  title: string; dirty: boolean; saving: boolean; msg: { ok: boolean; text: string } | null; onSave: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/templates" className="text-gray-400 hover:text-navy-900"><ArrowLeft size={18} /></Link>
        <h1 className="font-display font-semibold text-navy-900 text-xl flex-1 basis-[calc(100%-2.5rem)] md:basis-0 min-w-0 md:truncate">{title || 'Template'}</h1>
        <button onClick={onSave} disabled={saving || !dirty} className={primaryBtn}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
    </>
  )
}

const STEP_KINDS = ['email', 'follow-up', 'call', 'meeting', 'note']

export function ActivityTemplateEditor({ id }: { id: string }) {
  const { data, loadError, dirty, saving, msg, edit, save, remove } = useTemplate<ActivityTemplate>('activity', id)
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>
  if (!data) return <p className="text-sm text-gray-400">Loading template…</p>

  const setStep = (n: number, p: Partial<ActivityStep>) =>
    edit({ steps: data.steps.map((s, i) => (i === n ? { ...s, ...p } : s)) })

  return (
    <div className="space-y-5">
      <Header title={data.name} dirty={dirty} saving={saving} msg={msg} onSave={save} />
      <div className="bg-white rounded-xl border border-border p-4 md:p-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Template name</label>
          <input className={inputCls} value={data.name} onChange={e => edit({ name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <input className={inputCls} value={data.description ?? ''} onChange={e => edit({ description: e.target.value })} />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Steps are laid down on a lead in order. “Days after start” is counted from the day the template is applied.
        Email text can use [[FirstName]], [[LastName]], [[DisplayName]] and [[Signature]].
      </p>
      {data.steps.map((s, n) => (
        <div key={n} className="bg-white rounded-xl border border-border p-3 md:p-4 relative">
          <button
            onClick={() => edit({ steps: data.steps.filter((_, i) => i !== n) })}
            title="Remove step" className="absolute top-2 right-2 text-gray-300 hover:text-red-500"
          ><Trash2 size={15} /></button>
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pr-6">
            <div className="md:col-span-3">
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={s.kind} onChange={e => setStep(n, { kind: e.target.value })}>
                {[...new Set([...STEP_KINDS, s.kind])].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-5">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={s.title} onChange={e => setStep(n, { title: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Days after start</label>
              <input
                type="number" min={0} className={inputCls} value={s.offset_days}
                onChange={e => setStep(n, { offset_days: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Assign to</label>
              <input className={inputCls} value={s.assign_to} onChange={e => setStep(n, { assign_to: e.target.value })} />
            </div>
            {s.kind === 'email' && (
              <div className="col-span-2 md:col-span-12">
                <label className={labelCls}>Subject</label>
                <input className={inputCls} value={s.subject ?? ''} onChange={e => setStep(n, { subject: e.target.value })} />
              </div>
            )}
            <div className="col-span-2 md:col-span-12">
              <label className={labelCls}>{s.kind === 'email' ? 'Email body' : 'Details'}</label>
              <textarea rows={s.kind === 'email' ? 6 : 2} className={inputCls} value={s.body ?? ''} onChange={e => setStep(n, { body: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={() => edit({ steps: [...data.steps, { kind: 'follow-up', title: '', offset_days: 0, subject: null, body: null, assign_to: 'salesperson' }] })}
        className={ghostBtn}
      ><Plus size={14} /> Add step</button>

      <div className="pt-4 border-t border-gray-100">
        <button onClick={remove} className="text-sm text-red-500 hover:text-red-700 inline-flex items-center gap-1.5">
          <Trash2 size={14} /> Delete template
        </button>
      </div>
    </div>
  )
}

export function DocumentTemplateEditor({ id }: { id: string }) {
  const { data, loadError, dirty, saving, msg, edit, save, remove } = useTemplate<DocumentTemplate>('document', id)
  const area = useRef<HTMLTextAreaElement>(null)
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>
  if (!data) return <p className="text-sm text-gray-400">Loading template…</p>

  function insert(v: string) {
    const el = area.current
    const token = `{{${v}}}`
    if (!el || !data) return
    const a = el.selectionStart ?? data.body.length
    const b = el.selectionEnd ?? a
    edit({ body: data.body.slice(0, a) + token + data.body.slice(b) })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length) })
  }

  return (
    <div className="space-y-5">
      <Header title={data.name} dirty={dirty} saving={saving} msg={msg} onSave={save} />
      <div className="bg-white rounded-xl border border-border p-4 md:p-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Template name</label>
          <input className={inputCls} value={data.name} onChange={e => edit({ name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={data.kind} onChange={e => edit({ kind: e.target.value })}>
            {Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-900 md:col-span-2">
          <input type="checkbox" checked={data.is_default} onChange={e => edit({ is_default: e.target.checked })} />
          Use as the default for this type
        </label>
        <div className="md:col-span-2">
          <label className={labelCls}>Text</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(DOC_VARIABLES[data.kind] ?? []).map(v => (
              <button
                key={v} type="button" onClick={() => insert(v)}
                className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-gray-50 text-navy-800 hover:border-gold-400"
              >{`{{${v}}}`}</button>
            ))}
          </div>
          <textarea ref={area} rows={16} className={`${inputCls} font-mono text-[13px] leading-relaxed`} value={data.body} onChange={e => edit({ body: e.target.value })} />
        </div>
      </div>
      <div className="pt-4 border-t border-gray-100">
        <button onClick={remove} className="text-sm text-red-500 hover:text-red-700 inline-flex items-center gap-1.5">
          <Trash2 size={14} /> Delete template
        </button>
      </div>
    </div>
  )
}
