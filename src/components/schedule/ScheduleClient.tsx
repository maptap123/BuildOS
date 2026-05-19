'use client'

import { useState } from 'react'
import { AlertCircle, Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useSchedule } from '@/hooks/useSchedule'
import { ScheduleList } from './ScheduleList'
import { AddScheduleItemModal } from './AddScheduleItemModal'
import type { ScheduleItem, OutlookSyncStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  initialItems: ScheduleItem[]
  permissions: Permissions
  outlookConnected?: boolean
}

const OUTLOOK_STATUS: Record<OutlookSyncStatus, { icon: React.ReactNode; text: string; color: string }> = {
  not_synced: { icon: null,                                                        text: 'Not synced', color: 'text-gray-400' },
  pending:    { icon: <RefreshCw size={12} className="animate-spin" />,            text: 'Syncing…',   color: 'text-blue-500' },
  synced:     { icon: <CheckCircle2 size={12} />,                                  text: 'Synced',     color: 'text-green-600' },
  error:      { icon: <AlertTriangle size={12} />,                                 text: 'Sync error', color: 'text-red-500' },
}

export function ScheduleClient({ jobId, initialItems, permissions, outlookConnected = false }: Props) {
  const { items, loading, error, refresh } = useSchedule(jobId, initialItems)
  const [showAdd, setShowAdd]   = useState(false)
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function handleEdit(item: ScheduleItem) {
    if (permissions.can_edit) setEditItem(item)
  }

  async function handleOutlookSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/integrations/outlook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSyncMsg({ type: 'err', text: data.error ?? 'Sync failed' })
      } else {
        setSyncMsg({ type: 'ok', text: data.message ?? 'Sync queued' })
        refresh()
      }
    } catch {
      setSyncMsg({ type: 'err', text: 'Network error — try again' })
    } finally {
      setSyncing(false)
    }
  }

  function handleICalExport() {
    window.open(`/api/schedule/export?job_id=${jobId}`, '_blank')
  }

  const syncedCount = items.filter(i => i.outlook_sync_status === 'synced').length
  const totalItems  = items.length

  return (
    <div className="space-y-5">

      {/* Outlook sync toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {outlookConnected && totalItems > 0 && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${OUTLOOK_STATUS['synced'].color}`}>
              {OUTLOOK_STATUS['synced'].icon}
              <span>{syncedCount}/{totalItems} synced to Outlook</span>
            </div>
          )}
          {syncMsg && (
            <span className={`text-xs font-medium ${syncMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {syncMsg.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <button
              onClick={handleICalExport}
              title="Export as iCalendar (.ics)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={12} />
              Export .ics
            </button>
          )}
          {permissions.can_edit && outlookConnected && totalItems > 0 && (
            <button
              onClick={handleOutlookSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync to Outlook'}
            </button>
          )}
          {permissions.can_edit && !outlookConnected && totalItems > 0 && (
            <span className="text-xs text-gray-400">
              Connect Outlook in Settings to enable calendar sync
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
          Loading schedule…
        </div>
      ) : (
        <ScheduleList
          items={items}
          canCreate={permissions.can_create}
          onAdd={() => setShowAdd(true)}
          onEdit={handleEdit}
        />
      )}

      {showAdd && (
        <AddScheduleItemModal
          jobId={jobId}
          allItems={items}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh() }}
        />
      )}

      {editItem && (
        <AddScheduleItemModal
          jobId={jobId}
          item={editItem}
          allItems={items}
          canDelete={permissions.can_delete}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); refresh() }}
        />
      )}
    </div>
  )
}
