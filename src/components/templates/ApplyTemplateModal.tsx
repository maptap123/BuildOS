'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api, inputCls, labelCls, primaryBtn, ghostBtn } from './ui'

interface Props {
  /** Fix the job (opened from a job's schedule) or leave unset to pick one. */
  jobId?: string
  /** Fix the template (opened from a template) or leave unset to pick one. */
  templateId?: string
  onClose: () => void
  onApplied?: () => void
}

type Result = { schedule_items: number; tasks: number; selections: number; unmatched_assignees: string[] }

export function ApplyTemplateModal({ jobId, templateId, onClose, onApplied }: Props) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([])
  const [tpl, setTpl] = useState(templateId ?? '')
  const [job, setJob] = useState(jobId ?? '')
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [sections, setSections] = useState({ schedule: true, tasks: true, selections: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!templateId) {
      api<{ job: { id: string; name: string }[] }>('/api/templates')
        .then(d => setTemplates(d.job)).catch(e => setError(e.message))
    }
    if (!jobId) {
      api<{ id: string; name: string }[]>('/api/jobs')
        .then(d => setJobs(Array.isArray(d) ? d : [])).catch(e => setError(e.message))
    }
  }, [templateId, jobId])

  async function apply() {
    setBusy(true); setError(null)
    try {
      const r = await api<Result>(`/api/templates/job/${tpl}/apply`, {
        method: 'POST',
        body: JSON.stringify({ job_id: job, start_date: start, sections }),
      })
      setResult(r)
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const none = !sections.schedule && !sections.tasks && !sections.selections

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">Apply template to job</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {result ? (
            <div className="space-y-3 text-sm text-navy-900">
              <p className="font-semibold text-green-700">Template applied.</p>
              <ul className="list-disc pl-5 text-gray-600">
                <li>{result.schedule_items} schedule items added</li>
                <li>{result.tasks} tasks added</li>
                <li>{result.selections} selections added</li>
              </ul>
              {result.unmatched_assignees.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  No BuildOS user matched: {result.unmatched_assignees.join(', ')}. Those rows were left unassigned.
                </p>
              )}
            </div>
          ) : (
            <>
              {!templateId && (
                <div>
                  <label className={labelCls}>Template</label>
                  <select className={inputCls} value={tpl} onChange={e => setTpl(e.target.value)}>
                    <option value="">Choose a template…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {!jobId && (
                <div>
                  <label className={labelCls}>Job</label>
                  <select className={inputCls} value={job} onChange={e => setJob(e.target.value)}>
                    <option value="">Choose a job…</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Start date (day 1 of the template)</label>
                <input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">Weekends and non-work days are skipped.</p>
              </div>
              <div>
                <label className={labelCls}>What to add</label>
                <div className="flex flex-wrap gap-4">
                  {(['schedule', 'tasks', 'selections'] as const).map(k => (
                    <label key={k} className="flex items-center gap-2 text-sm text-navy-900 capitalize">
                      <input
                        type="checkbox" checked={sections[k]}
                        onChange={e => setSections(s => ({ ...s, [k]: e.target.checked }))}
                      />
                      {k}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Applying only adds — it never changes or removes anything already on the job.</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          {result ? (
            <button onClick={onClose} className={`${primaryBtn} flex-1`}>Done</button>
          ) : (
            <>
              <button onClick={onClose} className={`${ghostBtn} flex-1`}>Cancel</button>
              <button onClick={apply} disabled={busy || !tpl || !job || !start || none} className={`${primaryBtn} flex-1`}>
                {busy ? 'Applying…' : 'Apply'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
