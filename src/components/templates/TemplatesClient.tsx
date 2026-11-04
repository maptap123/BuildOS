'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Copy, X } from 'lucide-react'
import {
  api, inputCls, labelCls, primaryBtn, ghostBtn, DOC_KINDS, type JobTemplate,
} from './ui'
import { ApplyTemplateModal } from './ApplyTemplateModal'

type JobRow = { id: string; name: string; description: string | null; schedule_items: number; tasks: number; selections: number }
type ActRow = { id: string; name: string; description: string | null; steps: number }
type DocRow = { id: string; kind: string; name: string; is_default: boolean }
type Listing = { job: JobRow[]; activity: ActRow[]; document: DocRow[] }

const TABS = [
  { key: 'job', label: 'Job templates', blurb: 'Schedule, tasks and selections laid onto a new job.' },
  { key: 'activity', label: 'Lead activities', blurb: 'Follow-up and email sequences for a lead.' },
  { key: 'document', label: 'Documents', blurb: 'Lien waivers and reusable text with fill-in fields.' },
] as const
type TabKey = (typeof TABS)[number]['key']

export function TemplatesClient({ canEdit }: { canEdit: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('job')
  const [data, setData] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    try { setData(await api<Listing>('/api/templates')) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function duplicate(id: string) {
    try {
      const src = await api<JobTemplate>(`/api/templates/job/${id}`)
      const { id: newId } = await api<{ id: string }>('/api/templates/job', {
        method: 'POST', body: JSON.stringify({ name: `${src.name} (copy)`, description: src.description }),
      })
      // Children get fresh uuids client-side so they never collide with the original's rows.
      const itemMap = new Map(src.schedule_items.map(i => [i.id, crypto.randomUUID()]))
      const taskMap = new Map(src.tasks.map(t => [t.id, crypto.randomUUID()]))
      await api(`/api/templates/job/${newId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...src, name: `${src.name} (copy)`,
          schedule_items: src.schedule_items.map(i => ({
            ...i, id: itemMap.get(i.id), predecessors: i.predecessors.map(p => ({ ...p, item_id: itemMap.get(p.item_id) })),
          })),
          tasks: src.tasks.map(t => ({
            ...t, id: taskMap.get(t.id),
            parent_id: t.parent_id ? taskMap.get(t.parent_id) : null,
            schedule_item_id: t.schedule_item_id ? itemMap.get(t.schedule_item_id) : null,
          })),
          selections: src.selections.map(s => ({ ...s, id: crypto.randomUUID() })),
        }),
      })
      router.push(`/templates/job/${newId}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not duplicate') }
  }

  const active = TABS.find(t => t.key === tab)!

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 basis-full md:basis-0 min-w-0">
          <h1 className="font-display font-semibold text-navy-900 text-xl">Templates</h1>
          <p className="text-sm text-gray-400">{active.blurb}</p>
        </div>
        {tab === 'job' && canEdit && (
          <button onClick={() => setApplying(true)} className={ghostBtn}>Apply to a job</button>
        )}
        {canEdit && (
          <button onClick={() => setCreating(true)} className={primaryBtn}><Plus size={14} /> New template</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? 'border-gold-500 text-navy-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {t.label} {data && <span className="text-xs text-gray-400">({data[t.key].length})</span>}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {data && data[tab].length === 0 && (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-gray-400">
          Nothing here yet.
        </div>
      )}

      {data && (
        <div className="grid gap-3">
          {tab === 'job' && data.job.map(t => (
            <Row key={t.id} href={`/templates/job/${t.id}`} title={t.name}
              meta={`${t.schedule_items} schedule items · ${t.tasks} tasks · ${t.selections} selections`}
              sub={t.description}
              action={canEdit ? (
                <button onClick={e => { e.preventDefault(); void duplicate(t.id) }} title="Duplicate" className="text-gray-300 hover:text-navy-900 p-1">
                  <Copy size={15} />
                </button>
              ) : null}
            />
          ))}
          {tab === 'activity' && data.activity.map(t => (
            <Row key={t.id} href={`/templates/activity/${t.id}`} title={t.name}
              meta={`${t.steps} step${t.steps === 1 ? '' : 's'}`} sub={t.description} />
          ))}
          {tab === 'document' && data.document.map(t => (
            <Row key={t.id} href={`/templates/document/${t.id}`} title={t.name}
              meta={`${DOC_KINDS[t.kind] ?? t.kind}${t.is_default ? ' · default' : ''}`} sub={null} />
          ))}
        </div>
      )}

      {creating && <NewTemplateModal tab={tab} onClose={() => setCreating(false)} />}
      {applying && <ApplyTemplateModal onClose={() => setApplying(false)} />}
    </div>
  )
}

function Row({ href, title, meta, sub, action }: {
  href: string; title: string; meta: string; sub: string | null; action?: React.ReactNode
}) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-3 hover:border-gold-400 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-navy-900 text-sm truncate">{title}</p>
        <p className="text-xs text-gray-400">{meta}</p>
        {sub && <p className="text-xs text-gray-500 truncate mt-0.5">{sub}</p>}
      </div>
      {action}
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  )
}

function NewTemplateModal({ tab, onClose }: { tab: TabKey; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [docKind, setDocKind] = useState('lien_waiver')
  const [fromJob, setFromJob] = useState('')
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'job') api<{ id: string; name: string }[]>('/api/jobs?status=active&status=presale').then(d => setJobs(Array.isArray(d) ? d : [])).catch(() => {})
  }, [tab])

  async function create() {
    setBusy(true); setError(null)
    try {
      const { id } = await api<{ id: string }>(`/api/templates/${tab}`, {
        method: 'POST',
        body: JSON.stringify({ name, kind: docKind, from_job_id: fromJob || undefined }),
      })
      router.push(`/templates/${tab}/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong'); setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">New {TABS.find(t => t.key === tab)!.label.toLowerCase().replace(/s$/, '')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input autoFocus className={inputCls} value={name} onChange={e => setName(e.target.value)} />
          </div>
          {tab === 'document' && (
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={docKind} onChange={e => setDocKind(e.target.value)}>
                {Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          {tab === 'job' && (
            <div>
              <label className={labelCls}>Start from an existing job (optional)</label>
              <select className={inputCls} value={fromJob} onChange={e => setFromJob(e.target.value)}>
                <option value="">Blank template</option>
                {jobs.map(j => <option key={j.id} value={j.id}>Copy of {j.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Copies the job’s schedule, tasks and selections. Dates become day numbers.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={`${ghostBtn} flex-1`}>Cancel</button>
          <button onClick={create} disabled={busy || !name.trim()} className={`${primaryBtn} flex-1`}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
