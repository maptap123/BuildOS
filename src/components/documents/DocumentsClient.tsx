'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle, Trash2, Upload, FileText, FileImage, File as FileIcon,
  Folder, FolderOpen, ChevronRight, Search, Briefcase,
} from 'lucide-react'
import { UploadDocumentModal } from './UploadDocumentModal'
import type { Document } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface DocJob {
  id: string
  name: string
  job_number: string | null
}

interface Props {
  initialDocuments: Document[]
  permissions: Permissions
  /** All jobs (used for the job folders at the root). Omit when scoped to one job. */
  jobs?: DocJob[]
  /** Currently open job folder ('none' = documents not tied to a job). */
  jobId?: string | null
  /** Currently open sub-folder inside the job. */
  folder?: string | null
  /** Page the folder links point to, e.g. /documents or /jobs/abc/documents. */
  basePath?: string
  /** True when the page is already scoped to a single job (job page). */
  scoped?: boolean
}

const NO_FOLDER = 'Unfiled'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function docIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return <FileImage size={18} className="text-emerald-500 shrink-0" />
  if (ext === 'pdf') return <FileText size={18} className="text-red-500 shrink-0" />
  if (['doc', 'docx'].includes(ext)) return <FileText size={18} className="text-blue-500 shrink-0" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileText size={18} className="text-green-600 shrink-0" />
  return <FileIcon size={18} className="text-gray-400 shrink-0" />
}

export function DocumentsClient({
  initialDocuments, permissions, jobs = [], jobId = null, folder = null,
  basePath = '/documents', scoped = false,
}: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [showUpload, setShowUpload] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const activeJobId = scoped ? 'scoped' : jobId
  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])

  function href(job?: string | null, sub?: string | null): string {
    const p = new URLSearchParams()
    if (!scoped && job) p.set('job', job)
    if (sub) p.set('folder', sub)
    const qs = p.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

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
      const url = scoped && jobId ? `/api/documents?job_id=${jobId}` : '/api/documents'
      const res = await fetch(url)
      if (res.ok) setDocuments(await res.json())
    } catch {
      // user can retry
    }
  }

  // ── What is shown at the current level ────────────────────────────────────
  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const searchHits = searching
    ? documents.filter(d => d.file_name.toLowerCase().includes(q))
    : []

  const atRoot = !scoped && !activeJobId
  const jobDocs = useMemo(() => {
    if (scoped) return documents
    if (activeJobId === 'none') return documents.filter(d => !d.job_id)
    if (activeJobId) return documents.filter(d => d.job_id === activeJobId)
    return []
  }, [documents, scoped, activeJobId])

  // Root: one folder per job that has documents (+ "No job")
  const jobFolders = useMemo(() => {
    if (!atRoot) return []
    const counts = new Map<string, number>()
    for (const d of documents) {
      const k = d.job_id ?? 'none'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: id === 'none' ? 'General (no job)' : jobById.get(id)?.name ?? 'Unknown job',
        number: id === 'none' ? null : jobById.get(id)?.job_number ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [atRoot, documents, jobById])

  // Inside a job: sub-folders from the `folder` column
  const subFolders = useMemo(() => {
    if (atRoot || folder) return []
    const counts = new Map<string, number>()
    for (const d of jobDocs) if (d.folder) counts.set(d.folder, (counts.get(d.folder) ?? 0) + 1)
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  }, [atRoot, folder, jobDocs])

  const files = useMemo(() => {
    if (atRoot) return []
    const list = folder
      ? jobDocs.filter(d => (folder === NO_FOLDER ? !d.folder : d.folder === folder))
      : jobDocs.filter(d => !d.folder)
    return list
  }, [atRoot, folder, jobDocs])

  const jobName =
    scoped ? null
    : activeJobId === 'none' ? 'General (no job)'
    : activeJobId ? jobById.get(activeJobId)?.name ?? 'Job'
    : null

  const uploadJobId = scoped ? jobId : activeJobId && activeJobId !== 'none' ? activeJobId : null

  function FileRow({ doc }: { doc: Document }) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        {docIcon(doc.file_name)}
        <div className="flex-1 min-w-0">
          <a
            href={`/api/documents/${doc.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium text-navy-800 hover:text-gold-600 truncate"
          >
            {doc.file_name}
          </a>
          <p className="text-[11px] text-gray-400 truncate">
            {[
              searching ? [doc.jobs?.name, doc.folder].filter(Boolean).join(' › ') : null,
              formatBytes(doc.file_size),
              formatDate(doc.created_at),
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        {permissions.can_delete && (
          <button
            onClick={() => handleDelete(doc.id)}
            disabled={deleting === doc.id}
            className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
            title="Delete document"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    )
  }

  function FolderRow({ to, icon, title, sub, count }: { to: string; icon: React.ReactNode; title: string; sub?: string | null; count: number }) {
    return (
      <Link href={to} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy-900 truncate">{title}</p>
          {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{count} {count === 1 ? 'file' : 'files'}</span>
        <ChevronRight size={14} className="text-gray-300 shrink-0" />
      </Link>
    )
  }

  const empty = !searching && (atRoot ? jobFolders.length === 0 : subFolders.length === 0 && files.length === 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
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

      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-1 text-sm text-gray-500">
        {!scoped && (
          <>
            <Link href="/documents" className={`hover:text-navy-900 ${atRoot ? 'font-semibold text-navy-900' : ''}`}>All documents</Link>
            {jobName && (
              <>
                <ChevronRight size={13} className="text-gray-300" />
                <Link href={href(activeJobId)} className={`hover:text-navy-900 ${!folder ? 'font-semibold text-navy-900' : ''}`}>{jobName}</Link>
              </>
            )}
          </>
        )}
        {scoped && (
          <Link href={basePath} className={`hover:text-navy-900 ${!folder ? 'font-semibold text-navy-900' : ''}`}>Files</Link>
        )}
        {folder && (
          <>
            <ChevronRight size={13} className="text-gray-300" />
            <span className="font-semibold text-navy-900">{folder}</span>
          </>
        )}
      </nav>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search all documents by name…"
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm text-navy-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {searching ? (
        <div className="bg-white rounded-xl border border-border divide-y divide-border overflow-hidden">
          {searchHits.length === 0
            ? <p className="p-6 text-center text-sm text-gray-400">No documents match “{query}”.</p>
            : searchHits.map(d => <FileRow key={d.id} doc={d} />)}
        </div>
      ) : empty ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <FolderOpen size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">
            {atRoot ? 'No files have been uploaded to BuildOS yet.' : 'This folder is empty.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">OneDrive-linked files are shown on each job&apos;s Documents tab.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-border overflow-hidden">
          {atRoot && jobFolders.map(f => (
            <FolderRow
              key={f.id}
              to={href(f.id)}
              icon={<Briefcase size={18} className="text-gold-500 shrink-0" />}
              title={f.name}
              sub={f.number}
              count={f.count}
            />
          ))}
          {subFolders.map(f => (
            <FolderRow
              key={f.name}
              to={href(activeJobId, f.name)}
              icon={<Folder size={18} className="text-gold-500 shrink-0" />}
              title={f.name}
              count={f.count}
            />
          ))}
          {files.map(d => <FileRow key={d.id} doc={d} />)}
        </div>
      )}

      {showUpload && (
        <UploadDocumentModal
          defaultJobId={uploadJobId}
          defaultFolder={folder}
          lockJob={scoped}
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); refreshDocuments() }}
        />
      )}
    </div>
  )
}
