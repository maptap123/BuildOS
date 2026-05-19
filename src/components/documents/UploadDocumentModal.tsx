'use client'

// Note: 'documents' storage bucket must be created in the Supabase dashboard

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Job, DocumentModule } from '@/types'

const MODULE_OPTIONS: DocumentModule[] = ['job', 'budget', 'schedule', 'task', 'daily_log', 'admin']

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function UploadDocumentModal({ onClose, onSaved }: Props) {
  const [jobs, setJobs] = useState<Pick<Job, 'id' | 'name' | 'job_number'>[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [selectedModule, setSelectedModule] = useState<DocumentModule>('job')
  const [fileNameOverride, setFileNameOverride] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.ok ? r.json() : [])
      .then((data: Job[]) =>
        setJobs(data.map(j => ({ id: j.id, name: j.name, job_number: j.job_number })))
      )
      .catch(() => {})
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    setFile(picked)
    if (picked && !fileNameOverride) {
      setFileNameOverride(picked.name)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please select a file')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const jobPrefix = selectedJobId || 'general'
      const storagePath = `${jobPrefix}/${Date.now()}-${file.name}`

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (storageError) throw new Error(storageError.message)

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: selectedJobId || null,
          module: selectedModule,
          file_name: fileNameOverride.trim() || file.name,
          file_path: storagePath,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          storage_bucket: 'documents',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">File *</label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 w-full border-2 border-dashed border-gray-200 hover:border-gold-400 rounded-lg px-4 py-5 text-sm text-gray-400 hover:text-navy-700 transition-colors justify-center"
            >
              <Upload size={16} className="text-gold-500" />
              {file ? file.name : 'Choose a file…'}
            </button>
            {file && (
              <p className="mt-1 text-xs text-gray-400">
                {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">File Name / Caption</label>
            <input
              type="text"
              value={fileNameOverride}
              onChange={e => setFileNameOverride(e.target.value)}
              placeholder="Defaults to original file name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Module *</label>
            <select
              value={selectedModule}
              onChange={e => setSelectedModule(e.target.value as DocumentModule)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
            >
              {MODULE_OPTIONS.map(m => (
                <option key={m} value={m}>
                  {m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Linked Job (optional)</label>
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
            >
              <option value="">— No job —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.job_number} · {j.name}
                </option>
              ))}
            </select>
          </div>

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
              className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                'Upload'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
