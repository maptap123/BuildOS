'use client'

import { useState } from 'react'
import { AlertCircle, Trash2, Upload, FileText, ExternalLink } from 'lucide-react'
import { UploadDocumentModal } from './UploadDocumentModal'
import type { Document } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  initialDocuments: Document[]
  permissions: Permissions
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DocumentsClient({ initialDocuments, permissions }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [showUpload, setShowUpload] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      setDocuments(prev => prev.filter(d => d.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document')
    } finally {
      setDeleting(null)
    }
  }

  async function refreshDocuments() {
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch {
      // user can retry
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-navy-900">Documents</h1>
        {permissions.can_create && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={15} />
            Upload File
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <FileText size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No documents yet.</p>
          {permissions.can_create && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 text-sm font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
            >
              Upload the first file
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Uploaded</th>
                {permissions.can_delete && (
                  <th className="px-4 py-3 w-10" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map(doc => {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
                const downloadUrl = supabaseUrl
                  ? `${supabaseUrl}/storage/v1/object/public/${doc.storage_bucket}/${doc.file_path}`
                  : '#'

                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-navy-700 hover:text-navy-900 font-medium group"
                      >
                        <FileText size={15} className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-[200px] sm:max-w-xs">{doc.file_name}</span>
                        <ExternalLink size={12} className="text-gray-300 group-hover:text-gold-500 shrink-0 transition-colors" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                      <span className="uppercase text-xs font-medium">{doc.file_type.split('/').pop()}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="capitalize text-xs bg-navy-50 text-navy-700 rounded-full px-2 py-0.5 font-medium">
                        {doc.module.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">
                      {formatBytes(doc.file_size)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden lg:table-cell text-xs">
                      {formatDate(doc.created_at)}
                    </td>
                    {permissions.can_delete && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                          title="Delete document"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); refreshDocuments() }}
        />
      )}
    </div>
  )
}
