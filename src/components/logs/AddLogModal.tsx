'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Camera, Image as ImageIcon, Trash2, CloudOff } from 'lucide-react'
import { saveLogDraft, loadLogDraft, clearLogDraft, markLogDraftPending } from '@/lib/logDrafts'
import type { DailyLog } from '@/types'

interface Props {
  jobId: string
  log?: DailyLog | null
  onClose: () => void
  onSaved: (log: DailyLog) => void
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
  const draftKey = `add:${jobId}`
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(() => {
    // New logs: restore an unsent draft from this phone if one exists
    if (!log) {
      const draft = typeof window !== 'undefined' ? loadLogDraft(`add:${jobId}`) : null
      if (draft) return { log_date: draft.log_date, work_performed: draft.work_performed }
    }
    return {
      log_date:       log?.log_date ?? todayDate(),
      work_performed: log?.work_performed ?? '',
    }
  })

  // Autosave the draft on every change (new logs only)
  useEffect(() => {
    if (isEdit) return
    saveLogDraft({
      key: draftKey,
      job_id: jobId,
      log_date: form.log_date,
      work_performed: form.work_performed,
    })
  }, [isEdit, draftKey, jobId, form.log_date, form.work_performed])

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function addPhotos(incoming: FileList | null) {
    if (!incoming) return
    setPhotos(prev => [...prev, ...Array.from(incoming)])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.work_performed.trim()) {
      setError('Work performed is required')
      return
    }
    setSaving(true)
    setError(null)
    setSavedOffline(false)
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

      const savedLog = await res.json() as DailyLog

      if (photos.length > 0 && !isEdit) {
        if (savedLog.id) {
          await Promise.all(photos.map(file => {
            const fd = new FormData()
            fd.append('job_id', jobId)
            fd.append('log_id', savedLog.id)
            fd.append('file', file)
            return fetch('/api/photos', { method: 'POST', body: fd })
          }))
        }
      }

      if (!isEdit) clearLogDraft(draftKey)
      onSaved(savedLog)
    } catch (e) {
      // Network failure (dead zone) vs. server rejection: only network
      // failures are retried automatically from the saved draft.
      const isNetworkError = e instanceof TypeError
      if (isNetworkError && !isEdit) {
        markLogDraftPending(draftKey)
        setSavedOffline(true)
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
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
              {/* Camera: opens the device camera directly on phones */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
              />
              {/* Gallery: pick shots taken earlier */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs font-semibold bg-navy-900 hover:bg-navy-800 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  <Camera size={13} className="text-gold-400" />
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <ImageIcon size={13} className="text-gold-500" />
                  Gallery
                </button>
              </div>
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

          {savedOffline && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <CloudOff size={15} className="shrink-0 mt-0.5" />
              <span>
                No connection — your log is saved on this phone and will send automatically when
                you&apos;re back online.
                {photos.length > 0 && ' Photos stay attached here until it sends.'}
              </span>
            </div>
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
