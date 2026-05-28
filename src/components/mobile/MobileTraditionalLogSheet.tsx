'use client'

import { useRef, useState } from 'react'
import { X, Camera, Briefcase, Tag, ChevronRight, Check } from 'lucide-react'
import { JobPickerSheet } from '@/components/jobs'
import type { DailyLog, Job } from '@/types'

interface JobInfo {
  id: string
  name: string
}

interface Props {
  initialJob: JobInfo | null
  onClose: () => void
  onSaved?: (log: DailyLog) => void
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

export function MobileTraditionalLogSheet({ initialJob, onClose, onSaved }: Props) {
  const [job, setJob] = useState<JobInfo | null>(initialJob)
  const [jobPickerOpen, setJobPickerOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [costCode, setCostCode] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!job) {
      setError('Please select a job to save this log.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          log_date: todayDate(),
          work_performed: notes.trim() || null,
          cost_code: costCode.trim() || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      const savedLog = await res.json() as DailyLog

      if (photos.length > 0 && savedLog.id) {
        await Promise.all(photos.map(file => {
          const fd = new FormData()
          fd.append('job_id', job.id)
          fd.append('log_id', savedLog.id)
          fd.append('file', file)
          return fetch('/api/photos', { method: 'POST', body: fd })
        }))
      }

      onSaved?.(savedLog)
      setSaved(true)
      setTimeout(onClose, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white flex flex-col"
        style={{ maxHeight: '92dvh', boxShadow: '0 -8px 40px rgba(0,0,0,0.22)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-bold text-[#1b2b4a] text-lg">New Daily Log</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-[#1b2b4a] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 min-h-0">

          {/* Work notes */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Work Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              autoFocus
              placeholder="What did the crew accomplish today? (optional)"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-[#1b2b4a] placeholder-gray-300 focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c] resize-none"
            />
          </div>

          {/* Job */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Job
            </label>
            <button
              type="button"
              onClick={() => setJobPickerOpen(true)}
              className="w-full flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 bg-white text-left transition-colors active:bg-gray-50 hover:border-[#1b2b4a]"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <Briefcase size={14} className="text-[#d4a83c]" />
              </div>
              <span className={`flex-1 text-sm ${job ? 'text-[#1b2b4a] font-medium' : 'text-gray-400'}`}>
                {job ? job.name : 'Choose a job (optional)'}
              </span>
              <ChevronRight size={16} className="text-gray-400 shrink-0" />
            </button>
          </div>

          {/* Cost Code */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Cost Code
            </label>
            <div className="relative">
              <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={costCode}
                onChange={e => setCostCode(e.target.value)}
                placeholder="e.g. 03-100 (optional)"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm text-[#1b2b4a] placeholder-gray-300 focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c]"
              />
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Photos
            </label>
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
              className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl py-3.5 text-sm text-gray-500 hover:border-[#d4a83c] hover:text-[#1b2b4a] transition-colors"
            >
              <Camera size={16} className="text-[#d4a83c]" />
              Add Photos
            </button>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-5 py-4 border-t border-gray-100"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {saved ? (
            <div className="flex items-center justify-center gap-2 h-12 text-green-600">
              <Check size={18} strokeWidth={2.5} />
              <span className="font-semibold text-sm">Log saved!</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl transition-colors active:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] text-sm font-bold py-3 rounded-xl transition-all disabled:opacity-60 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)', color: '#0b1623' }}
              >
                {saving ? 'Saving…' : 'Save Log'}
              </button>
            </div>
          )}
        </div>
      </div>

      {jobPickerOpen && (
        <JobPickerSheet
          onClose={() => setJobPickerOpen(false)}
          currentJobId={job?.id ?? null}
          onSelect={(picked: Job) => {
            setJob({ id: picked.id, name: picked.name })
            setJobPickerOpen(false)
          }}
        />
      )}
    </>
  )
}
