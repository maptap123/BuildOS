'use client'

import { useEffect, useState } from 'react'
import { CloudUpload } from 'lucide-react'
import { retryPendingLogDrafts, LOG_DRAFT_SYNCED_EVENT } from '@/lib/logDrafts'
import { processOutbox, LOG_OUTBOX_STATUS_EVENT, type OutboxStatus } from '@/lib/logOutbox'

/**
 * Mounted once in the dashboard layout. Retries pending offline log drafts
 * on app open and whenever the connection comes back, and shows a brief
 * toast when a draft syncs.
 */
export function LogDraftSync() {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    function handleSynced(e: Event) {
      const synced = (e as CustomEvent<{ synced: number }>).detail?.synced ?? 0
      if (synced > 0) {
        setToast(synced === 1 ? 'Saved log synced' : `${synced} saved logs synced`)
      }
    }

    function handleOutbox(e: Event) {
      const status = (e as CustomEvent<OutboxStatus>).detail
      if (status?.message) setToast(status.message)
    }

    function retry() {
      retryPendingLogDrafts().catch(() => {})
      processOutbox().catch(() => {})
    }

    function onVisible() {
      if (document.visibilityState === 'visible') retry()
    }

    window.addEventListener(LOG_DRAFT_SYNCED_EVENT, handleSynced)
    window.addEventListener(LOG_OUTBOX_STATUS_EVENT, handleOutbox)
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    retry()

    return () => {
      window.removeEventListener(LOG_DRAFT_SYNCED_EVENT, handleSynced)
      window.removeEventListener(LOG_OUTBOX_STATUS_EVENT, handleOutbox)
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  if (!toast) return null

  return (
    <div
      className="fixed z-50 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-navy-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
      role="status"
    >
      <CloudUpload size={15} className="text-gold-400" />
      {toast}
    </div>
  )
}
