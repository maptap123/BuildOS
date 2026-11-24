'use client'

import { useEffect, useRef, useState } from 'react'

type Option = { Id: string; DisplayName: string }
type Result = { job: { qb_link_version: number }; customers?: Option[]; projects?: Option[]; canCreate?: boolean; truncated?: boolean }

/** Only the creation checkbox authorizes a QuickBooks write (a new job under the homeowner). Selecting an existing job writes BuildOS only. */
export function QuickBooksProjectSetup({ jobId, onDone }: { jobId: string; onDone: (linked: boolean) => void }) {
  const endpoint = `/api/jobs/${jobId}/connected-systems/quickbooks`
  const [version, setVersion] = useState<number | null>(null)
  const [canCreate, setCanCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [parent, setParent] = useState('')
  const [project, setProject] = useState('')
  const [mode, setMode] = useState('existing')
  const [name, setName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [searched, setSearched] = useState(false)
  const pending = useRef(false)
  const sequence = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    dialog.current?.focus()
    fetch(endpoint, { cache: 'no-store' }).then(async r => {
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Could not load QuickBooks setup.')
      if (alive) { setVersion(data.job.qb_link_version); setCanCreate(!!data.canCreate) }
    }).catch(e => { if (alive) setError(e.message) })
    const invalidate = () => { sequence.current++ }
    return () => { alive = false; invalidate() }
  }, [endpoint])

  async function load(query: string, projectSearch: boolean) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    const token = ++sequence.current
    try {
      const response = await fetch(endpoint + query, { cache: 'no-store' })
      const result: Result & { error?: string } = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not read QuickBooks.')
      if (token !== sequence.current) return
      // Keep the version from opening the dialog: a stale editor must not silently overwrite a newer choice.
      if (projectSearch) setProjects(result.projects ?? [])
      else {
        const found = result.customers ?? []
        setCustomers(found)
        setSearched(true)
        setNotice(result.truncated ? 'First 100 matches. Narrow the homeowner search.'
          : found.length ? `${found.length} homeowner${found.length === 1 ? '' : 's'} found. Choose one in the list below.`
          : 'No active homeowners match that search. Try the last name or a shorter word. Sub-customers and projects are not listed here.')
      }
      if (typeof result.canCreate === 'boolean') setCanCreate(result.canCreate)
    } catch (e) { if (token === sequence.current) setError(e instanceof Error ? e.message : 'Could not read QuickBooks.') }
    finally { pending.current = false; setBusy(false) }
  }

  function searchNow() {
    if (search.trim().length < 2 || version === null) return
    setParent(''); setProject(''); setProjects([]); setConfirmed(false)
    void load(`?search=${encodeURIComponent(search.trim())}`, false)
  }

  async function save() {
    if (pending.current || version === null) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'existing' ? { action: 'select', customer_id: parent, project_id: project, version } : { action: 'create', customer_id: parent, name: name.trim(), confirmed, version }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Connection was not saved.')
      onDone(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection was not saved.') }
    finally { pending.current = false; setBusy(false) }
  }

  const selectedParent = customers.find(c => c.Id === parent)
  const field = 'w-full border border-gray-300 rounded px-3 py-2 text-sm'
  return <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="QuickBooks project setup" className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90dvh] overflow-auto space-y-4" onKeyDown={e => {
      if (e.key !== 'Tab') return
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')
      if (!nodes?.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }}>
      <h2 className="text-lg font-semibold">QuickBooks project setup</h2>
      <p className="text-sm text-gray-600">Does this homeowner already have a QuickBooks job for this job? Select it below, or create a new one under the homeowner. The BuildOS job is saved separately; a setup failure will not create another job.</p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block">Search homeowner<input className={field} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchNow() } }} /></label>
        <button type="button" disabled={search.trim().length < 2 || version === null} onClick={searchNow} className="border rounded px-3 py-2">Search</button>
        {notice && <p className="text-sm font-medium text-navy-800">{notice}</p>}
        <label className="block">QuickBooks homeowner<select className={field} value={parent} onChange={e => { setParent(e.target.value); setProject(''); setProjects([]); setConfirmed(false); if (e.target.value) void load(`?customer_id=${e.target.value}`, true) }}><option value="">{searched ? `Select homeowner (${customers.length} found)` : 'Select homeowner'}</option>{customers.map(c => <option key={c.Id} value={c.Id}>{c.DisplayName} (#{c.Id})</option>)}</select></label>
        <label className="flex gap-2"><input type="radio" name="qb-project-mode" checked={mode === 'existing'} onChange={() => { setMode('existing'); setConfirmed(false) }} />Use an existing QuickBooks job</label>
        {mode === 'existing' && <label className="block">Existing QuickBooks job<select className={field} disabled={!parent} value={project} onChange={e => setProject(e.target.value)}><option value="">Select job</option>{projects.map(p => <option key={p.Id} value={p.Id}>{p.DisplayName} (#{p.Id})</option>)}</select>{parent && !projects.length && <span className="text-sm">No active jobs found under this homeowner. Choose "Create a new QuickBooks job" to add one.</span>}</label>}
        <label className="flex gap-2"><input type="radio" name="qb-project-mode" checked={mode === 'new'} onChange={() => setMode('new')} />Create a new QuickBooks job</label>
        {mode === 'new' && <>
          {!canCreate && <p className="text-sm text-amber-700">Only QuickBooks approvers (August, Lisa, Jason, Evelyn) can create a job in QuickBooks. Ask one of them, or ask Fixer to propose it.</p>}
          <label className="block">New job name<input className={field} maxLength={100} value={name} onChange={e => { setName(e.target.value); setConfirmed(false) }} /></label>
          <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm creating the job “{name.trim() || 'new job'}” in QuickBooks under “{selectedParent?.DisplayName ?? 'select homeowner'}”. This writes a new job to QuickBooks.</label>
        </>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => onDone(false)} className="border rounded px-3 py-2">Set up later</button>
        <button type="button" disabled={busy || version === null || !parent || (mode === 'existing' ? !project : !confirmed || !name.trim() || !canCreate)} onClick={save} className="rounded bg-navy-800 text-white px-3 py-2 disabled:opacity-50">{busy ? 'Working…' : mode === 'existing' ? 'Save job connection' : 'Create job and connect'}</button>
      </div>
    </div>
  </div>
}
