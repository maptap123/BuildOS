'use client'

// Note: 'job-photos' storage bucket must exist in Supabase dashboard.
// The API route /api/photos handles server-side upload to this bucket.

import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Props {
  logId: string
  jobId: string
  onUploaded: () => void
}

interface UploadResult {
  file: string
  ok: boolean
  error?: string
}

export function LogPhotoUploader({ logId, jobId, onUploaded }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setFiles(prev => [...prev, ...Array.from(incoming)])
    setResults([])
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function upload() {
    if (files.length === 0) return
    setUploading(true)
    setResults([])
    setProgress({ done: 0, total: files.length })

    const uploadResults: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ done: i, total: files.length })

      try {
        const fd = new FormData()
        fd.append('job_id', jobId)
        fd.append('log_id', logId)
        fd.append('file', file)

        const res = await fetch('/api/photos', { method: 'POST', body: fd })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          uploadResults.push({ file: file.name, ok: false, error: body.error ?? `Error ${res.status}` })
        } else {
          uploadResults.push({ file: file.name, ok: true })
        }
      } catch (err) {
        uploadResults.push({
          file: file.name,
          ok: false,
          error: err instanceof Error ? err.message : 'Upload failed',
        })
      }
    }

    setProgress({ done: files.length, total: files.length })
    setResults(uploadResults)
    setUploading(false)

    const anyOk = uploadResults.some(r => r.ok)
    if (anyOk) {
      // Clear successfully uploaded files; keep failed ones for retry
      const failedNames = new Set(uploadResults.filter(r => !r.ok).map(r => r.file))
      setFiles(prev => prev.filter(f => failedNames.has(f.name)))
      onUploaded()
    }
  }

  return (
    <div className="space-y-3">
      {/* File picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = '' }}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
        >
          <Camera size={13} className="text-gold-500" />
          Select Photos
        </button>

        {files.length > 0 && !uploading && (
          <button
            type="button"
            onClick={upload}
            className="flex items-center gap-2 text-xs font-semibold bg-gold-500 hover:bg-gold-600 text-white px-3 py-2 rounded-lg transition-colors"
          >
            Upload {files.length} photo{files.length !== 1 ? 's' : ''}
          </button>
        )}

        {uploading && progress && (
          <span className="flex items-center gap-1.5 text-xs text-navy-600">
            <Loader2 size={12} className="animate-spin" />
            Uploading {progress.done + 1} of {progress.total}…
          </span>
        )}
      </div>

      {/* Selected file previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
              />
              {!uploading && (
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload results */}
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                r.ok
                  ? 'bg-green-50 text-green-700 border border-green-100'
                  : 'bg-red-50 text-red-700 border border-red-100'
              }`}
            >
              {r.ok
                ? <CheckCircle2 size={12} className="shrink-0" />
                : <AlertCircle size={12} className="shrink-0" />
              }
              <span className="truncate max-w-[200px]">{r.file}</span>
              {!r.ok && r.error && (
                <span className="text-red-500 ml-auto shrink-0">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
