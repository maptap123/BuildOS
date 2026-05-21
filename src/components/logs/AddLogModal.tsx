'use client'

import { useRef, useState } from 'react'
import { X, Camera, Trash2 } from 'lucide-react'
import type { DailyLog } from '@/types'

interface Props {
  jobId: string
  log?: DailyLog | null
  onClose: () => void
  onSaved: () => void
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

type FormState = {
  log_date: string
  work_performed: string
}

export function AddLogModal({ jobId, log, onClose, onSaved }: Props) {
  const isEdit = Boolean(log)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>({
    log_date:       log?.log_date ?? todayDate(),
    work_performed: log?.work_performed ?? '',
  })

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.work_performed.trim()) {
      setError('Work performed is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...(isEdit ? { id: log!.id } : { job_id: jobId }),
        log_date:       form.log_date,
        work_performed: form.work_performed.trim(),
      }
      const res = await fetch('/api/logs', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      if (photos.length > 0 && !isEdit) {
        const { id: logId } = await res.clone().json().catch(() => ({}))
        if (logId) {
          await Promise.all(photos.map(file => {
            const fd = new FormData()
            fd.append('job_id', jobId)
            fd.append('log_id', logId)
            fd.append('file', file)
            return fetch('/api/photos', { method: 'POST', body: fd })
          }))
        }
      }

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Log' : 'Add Daily Log'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Work Performed *</label>
            <textarea
              required
              autoFocus={!isEdit}
              value={form.work_performed}
              onChange={e => set('work_performed', e.target.value)}
              rows={7}
              placeholder="What did the crew accomplish today? Include trades, locations, materials used..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Photos</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  setPhotos(prev => [...prev, ...files])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 px-3 py-2 rounded-lg transition-colors"
              >
                <Camera size={13} className="text-gold-500" />
                Add Photos
              </button>
              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
