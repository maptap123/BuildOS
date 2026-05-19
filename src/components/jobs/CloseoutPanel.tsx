'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, CheckCircle2 } from 'lucide-react'
import type { Job } from '@/types'

interface Props {
  job: Pick<Job, 'id' | 'status' | 'warranty_start_date' | 'warranty_end_date' | 'closeout_checklist'>
  canEdit: boolean
}

const CHECKLIST_ITEMS = [
  { key: 'punch_list_complete',  label: 'Punch list complete'          },
  { key: 'client_walkthrough',   label: 'Client walkthrough done'      },
  { key: 'final_invoice_sent',   label: 'Final invoice sent'           },
  { key: 'lien_waivers',         label: 'Lien waivers collected'       },
  { key: 'warranty_docs',        label: 'Warranty documents delivered' },
  { key: 'closeout_photos',      label: 'Closeout photos uploaded'     },
]

export function CloseoutPanel({ job, canEdit }: Props) {
  const router = useRouter()
  const [checklist, setChecklist] = useState<Record<string, boolean>>(job.closeout_checklist ?? {})
  const [saving, setSaving] = useState(false)
  const [warrantyStart, setWarrantyStart] = useState(job.warranty_start_date ?? '')
  const [warrantyEnd, setWarrantyEnd] = useState(job.warranty_end_date ?? '')
  const [status, setStatus] = useState(job.status)

  if (!['active', 'warranty', 'closed'].includes(status)) return null

  const completedCount = CHECKLIST_ITEMS.filter(item => checklist[item.key]).length
  const allComplete = completedCount === CHECKLIST_ITEMS.length
  const progress = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100)

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleItem(key: string) {
    if (!canEdit) return
    const next = { ...checklist, [key]: !checklist[key] }
    setChecklist(next)
    await patch({ closeout_checklist: next })
  }

  async function moveToWarranty() {
    setStatus('warranty')
    await patch({ status: 'warranty' })
  }

  async function closeJob() {
    setStatus('closed')
    await patch({
      status: 'closed',
      ...(warrantyStart ? { warranty_start_date: warrantyStart } : {}),
      ...(warrantyEnd ? { warranty_end_date: warrantyEnd } : {}),
    })
  }

  async function saveWarrantyDates() {
    await patch({
      ...(warrantyStart ? { warranty_start_date: warrantyStart } : {}),
      ...(warrantyEnd ? { warranty_end_date: warrantyEnd } : {}),
    })
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="font-display font-semibold text-navy-900 mb-1 text-base">Job Closeout</h3>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">{completedCount} of {CHECKLIST_ITEMS.length} items complete</span>
          <span className="text-xs font-semibold text-navy-700">{progress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${allComplete ? 'bg-emerald-500' : 'bg-gold-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <ul className="space-y-2 mb-5">
        {CHECKLIST_ITEMS.map(item => {
          const checked = !!checklist[item.key]
          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={!canEdit || saving}
                onClick={() => toggleItem(item.key)}
                className={`w-full flex items-center gap-3 text-left py-1.5 px-2 rounded-lg transition-colors ${canEdit ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ${saving ? 'opacity-60' : ''}`}
              >
                {checked
                  ? <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                  : <Square size={16} className="text-gray-300 shrink-0" />
                }
                <span className={`text-sm ${checked ? 'line-through text-gray-400' : 'text-navy-800'}`}>
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Status progression */}
      {canEdit && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          {status === 'active' && allComplete && (
            <button
              type="button"
              disabled={saving}
              onClick={moveToWarranty}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              Move to Warranty &rarr;
            </button>
          )}

          {status === 'warranty' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-medium">Warranty period</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start date</label>
                  <input
                    type="date"
                    value={warrantyStart}
                    onChange={e => setWarrantyStart(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End date</label>
                  <input
                    type="date"
                    value={warrantyEnd}
                    onChange={e => setWarrantyEnd(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveWarrantyDates}
                  className="flex-1 border border-border hover:bg-gray-50 disabled:opacity-50 text-navy-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                >
                  Save dates
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeJob}
                  className="flex-1 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  Close Job
                </button>
              </div>
            </div>
          )}

          {status === 'closed' && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Job Closed</p>
                {(job.warranty_end_date || warrantyEnd) && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Warranty through{' '}
                    {new Date((job.warranty_end_date ?? warrantyEnd) + 'T12:00:00')
                      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Read-only closed state for non-editors */}
      {!canEdit && status === 'closed' && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">Job Closed</p>
        </div>
      )}
    </div>
  )
}
