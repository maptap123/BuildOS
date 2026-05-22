'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { useLogs } from '@/hooks/useLogs'
import { LogFeed } from './LogFeed'
import { AddLogModal } from './AddLogModal'
import { AiLogModal } from './AiLogModal'
import type { DailyLog, LogPhoto } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  initialLogs: DailyLog[]
  permissions: Permissions
}

export function LogClient({ jobId, initialLogs, permissions }: Props) {
  const searchParams = useSearchParams()
  const { logs, loading, error, upsertLog, removeLog } = useLogs(jobId, initialLogs)
  const isAiMode = searchParams.get('aiMode') === '1'
  const [showAdd, setShowAdd] = useState(() => searchParams.get('newLog') === '1' && !isAiMode)
  const [showAiLog, setShowAiLog] = useState(() => searchParams.get('newLog') === '1' && isAiMode)
  const [editLog, setEditLog] = useState<DailyLog | null>(null)
  const [photos, setPhotos] = useState<LogPhoto[]>([])

  useEffect(() => {
    fetch(`/api/photos?job_id=${jobId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setPhotos)
      .catch(() => {})
  }, [jobId])

  function refreshPhotos() {
    fetch(`/api/photos?job_id=${jobId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setPhotos)
      .catch(() => {})
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this log entry? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/logs?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete log')
      removeLog(id)
    } catch {
      // user can retry
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
          Loading logs…
        </div>
      ) : (
        <LogFeed
          logs={logs}
          photos={photos}
          permissions={permissions}
          onAdd={() => setShowAdd(true)}
          onEdit={log => setEditLog(log)}
          onDelete={handleDelete}
          onRefreshPhotos={refreshPhotos}
        />
      )}

      {showAdd && (
        <AddLogModal
          jobId={jobId}
          onClose={() => setShowAdd(false)}
          onSaved={log => { upsertLog(log); setShowAdd(false); refreshPhotos() }}
        />
      )}

      {showAiLog && (
        <AiLogModal
          jobId={jobId}
          onClose={() => setShowAiLog(false)}
          onSaved={log => { upsertLog(log); setShowAiLog(false); refreshPhotos() }}
        />
      )}

      {editLog && (
        <AddLogModal
          jobId={jobId}
          log={editLog}
          onClose={() => setEditLog(null)}
          onSaved={log => { upsertLog(log); setEditLog(null); refreshPhotos() }}
        />
      )}
    </div>
  )
}
