'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  File, FileText, FileImage, FolderOpen,
  ExternalLink, RefreshCw, Lock, Users, ChevronDown,
  CheckCircle, Clock, AlertCircle,
} from 'lucide-react'

type Visibility = 'admin_only' | 'all'

interface JobFile {
  id: string
  name: string
  webUrl: string
  size: number | null
  mimeType: string | null
  isFolder: boolean
  lastModified: string | null
  visibility: Visibility
}

type SyncStatus = 'not_linked' | 'candidate' | 'linked' | 'error'

interface Props {
  jobId: string
  /** When true, renders as a full-page view (no card wrapper, no grid span). */
  fullPage?: boolean
}

function fileIcon(name: string, mimeType: string | null) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext)) {
    return <FileImage size={16} className="text-emerald-500 shrink-0" />
  }
  if (['pdf'].includes(ext)) {
    return <FileText size={16} className="text-red-500 shrink-0" />
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return <FileText size={16} className="text-blue-500 shrink-0" />
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return <FileText size={16} className="text-green-600 shrink-0" />
  }
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return <FileText size={16} className="text-orange-500 shrink-0" />
  }
  if (mimeType?.startsWith('image/')) {
    return <FileImage size={16} className="text-emerald-500 shrink-0" />
  }
  return <File size={16} className="text-gray-400 shrink-0" />
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function VisibilityBadge({
  visibility,
  isAdmin,
  onToggle,
  loading,
}: {
  visibility: Visibility
  isAdmin: boolean
  onToggle: (v: Visibility) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)

  const label     = visibility === 'admin_only' ? 'Admin only' : 'All users'
  const Icon      = visibility === 'admin_only' ? Lock : Users
  const colorCls  = visibility === 'admin_only'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200'

  if (!isAdmin) {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorCls}`}>
        <Icon size={10} />
        {label}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity ${colorCls} ${loading ? 'opacity-50' : 'hover:opacity-80'}`}
      >
        <Icon size={10} />
        {label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-border rounded-xl shadow-lg min-w-[140px] py-1 text-sm">
          {(['admin_only', 'all'] as Visibility[]).map(v => (
            <button
              key={v}
              onClick={() => { onToggle(v); setOpen(false) }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors ${v === visibility ? 'font-semibold text-navy-900' : 'text-gray-700'}`}
            >
              {v === 'admin_only' ? <Lock size={12} className="text-amber-500" /> : <Users size={12} className="text-blue-500" />}
              {v === 'admin_only' ? 'Admin only' : 'All users'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function JobFilesPanel({ jobId, fullPage = false }: Props) {
  const [files, setFiles]         = useState<JobFile[]>([])
  const [linked, setLinked]       = useState(false)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [folderUrl, setFolderUrl] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('not_linked')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [fileListError, setFileListError] = useState<string | null>(null)
  const [updating, setUpdating]         = useState<string | null>(null)

  const fetchFiles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    setFileListError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/files`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const json = await res.json()
      setLinked(json.linked ?? false)
      setFiles(json.files ?? [])
      setIsAdmin(json.isAdmin ?? false)
      setFolderUrl(json.folderUrl ?? null)
      setFolderPath(json.folderPath ?? null)
      setSyncStatus(json.syncStatus ?? 'not_linked')
      setSyncError(json.syncError ?? null)
      setFileListError(json.fileListError ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [jobId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function updateVisibility(fileId: string, visibility: Visibility) {
    setUpdating(fileId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/files/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharepoint_item_id: fileId, visibility }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update permission')
      }
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, visibility } : f))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update permission')
    } finally {
      setUpdating(null)
    }
  }

  const folders = files.filter(f => f.isFolder)
  const docs    = files.filter(f => !f.isFolder)

  const containerClass = fullPage
    ? 'space-y-4'
    : 'bg-white rounded-xl border border-border p-5 md:col-span-2'

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between mb-4">
        {!fullPage && (
          <h3 className="font-display font-semibold text-navy-900 text-base">Job Documents</h3>
        )}
        {syncStatus === 'linked' && (
          <button
            onClick={() => fetchFiles(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-4 h-4 bg-gray-100 rounded" />
              <div className="h-3.5 bg-gray-100 rounded flex-1" />
              <div className="h-3.5 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* OneDrive folder connection card */}
          <OneDriveFolderCard
            syncStatus={syncStatus}
            folderUrl={folderUrl}
            folderPath={folderPath}
            syncError={syncError}
          />

          {/* File listing — shown when Graph API returned a file list */}
          {syncStatus === 'linked' && !linked && fileListError && (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400 text-sm gap-1.5">
              <FolderOpen size={24} className="text-gray-200" />
              <p>Could not load file list from OneDrive.</p>
              {isAdmin && <p className="text-xs text-red-400">{fileListError}</p>}
              {folderUrl && (
                <a
                  href={folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-gold-600 hover:text-gold-700 transition-colors"
                >
                  <ExternalLink size={13} />
                  Browse files directly in OneDrive
                </a>
              )}
            </div>
          )}
          {linked && (
            files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-gray-400 text-sm gap-2">
                <FolderOpen size={24} className="text-gray-200" />
                <p>{isAdmin ? 'No files in the linked OneDrive folder.' : 'No files are shared with you for this job.'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {folders.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Folders</p>
                    <div className="divide-y divide-gray-50">
                      {folders.map(f => (
                        <FileRow
                          key={f.id}
                          file={f}
                          isAdmin={isAdmin}
                          updatingId={updating}
                          onVisibilityChange={updateVisibility}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {docs.length > 0 && (
                  <div>
                    {folders.length > 0 && (
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Files</p>
                    )}
                    <div className="divide-y divide-gray-50">
                      {docs.map(f => (
                        <FileRow
                          key={f.id}
                          file={f}
                          isAdmin={isAdmin}
                          updatingId={updating}
                          onVisibilityChange={updateVisibility}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <p className="text-[11px] text-gray-400 pt-1">
                    New files default to <strong>Admin only</strong>. Toggle visibility to share with all users.
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function OneDriveFolderCard({
  syncStatus,
  folderUrl,
  folderPath,
  syncError,
}: {
  syncStatus: SyncStatus
  folderUrl: string | null
  folderPath: string | null
  syncError: string | null
}) {
  if (syncStatus === 'not_linked') {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 text-sm gap-1.5">
        <FolderOpen size={24} className="text-gray-200" />
        <p>No OneDrive folder linked to this job.</p>
        <p className="text-xs">Use the Connected Systems card to auto-match a folder.</p>
      </div>
    )
  }

  if (syncStatus === 'linked') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle size={16} className="text-green-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800">OneDrive folder connected</p>
          {folderPath && (
            <p className="text-xs text-green-700 mt-0.5 truncate">{folderPath}</p>
          )}
        </div>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-green-700 hover:text-green-900 transition-colors"
          >
            <ExternalLink size={13} />
            Open OneDrive Folder
          </a>
        )}
      </div>
    )
  }

  if (syncStatus === 'candidate') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Clock size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">Possible OneDrive folder found — review needed</p>
          {folderPath && (
            <p className="text-xs text-amber-700 mt-0.5 truncate">{folderPath}</p>
          )}
        </div>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
          >
            <ExternalLink size={13} />
            Open OneDrive Folder
          </a>
        )}
      </div>
    )
  }

  if (syncStatus === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">OneDrive folder sync error</p>
          {syncError && (
            <p className="text-xs text-red-700 mt-0.5">{syncError}</p>
          )}
        </div>
      </div>
    )
  }

  return null
}

function FileRow({
  file,
  isAdmin,
  updatingId,
  onVisibilityChange,
}: {
  file: JobFile
  isAdmin: boolean
  updatingId: string | null
  onVisibilityChange: (id: string, v: Visibility) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {file.isFolder
        ? <FolderOpen size={16} className="text-gold-500 shrink-0" />
        : fileIcon(file.name, file.mimeType)
      }

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-800 truncate">{file.name}</p>
        {(file.size || file.lastModified) && (
          <p className="text-[11px] text-gray-400">
            {[formatBytes(file.size), formatDate(file.lastModified)].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <VisibilityBadge
          visibility={file.visibility}
          isAdmin={isAdmin}
          loading={updatingId === file.id}
          onToggle={v => onVisibilityChange(file.id, v)}
        />
        <a
          href={file.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gold-600 transition-colors"
          title="Open in OneDrive"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
