'use client'

import { useEffect, useState } from 'react'
import { CloudUpload, X } from 'lucide-react'
import { retryPendingLogDrafts, LOG_DRAFT_SYNCED_EVENT } from '@/lib/logDrafts'
import {
  processOutbox, getOutboxSummary, retryOutbox,
  LOG_OUTBOX_STATUS_EVENT, type OutboxStatus, type OutboxSummary,
} from '@/lib/logOutbox'

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

  // Persistent "still on this phone" banner — a 4s toast is too easy to miss
  const [summary, setSummary] = useState<OutboxSummary | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () => getOutboxSummary().then(s => alive && setSummary(s)).catch(() => {})
    refresh()
    const id = setInterval(refresh, 5000)
    // Keep trying on its own while the app is open (single-flight, so this is safe)
    const retryId = setInterval(() => { processOutbox().catch(() => {}) }, 30000)
    window.addEventListener(LOG_OUTBOX_STATUS_EVENT, refresh)
    window.addEventListener(LOG_DRAFT_SYNCED_EVENT, refresh)
    return () => {
      alive = false
      clearInterval(id)
      clearInterval(retryId)
      window.removeEventListener(LOG_OUTBOX_STATUS_EVENT, refresh)
      window.removeEventListener(LOG_DRAFT_SYNCED_EVENT, refresh)
    }
  }, [])

  // Closing the banner hides it until another log is added to the queue
  const [dismissedAt, setDismissedAt] = useState(0)
  useEffect(() => {
    if (summary && summary.pending === 0) setDismissedAt(0)
  }, [summary])
  const stuck = summary && summary.pending > 0 && summary.pending > dismissedAt

  return (
    <>
      {stuck && (
        <div
          className="fixed z-50 left-3 right-3 flex items-center gap-2 bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold px-3 py-2.5 rounded-xl shadow-lg"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 132px)' }}
        >
          <CloudUpload size={15} className="shrink-0" />
          <span className="flex-1">
            {summary.pending} log{summary.pending !== 1 ? 's' : ''}
            {summary.photos > 0 ? ` (${summary.photos} photo${summary.photos !== 1 ? 's' : ''})` : ''} pending upload —
            saved on this phone, will upload automatically when signal is better.
          </span>
          <button
            type="button"
            onClick={() => { retryOutbox().catch(() => {}) }}
            className="underline shrink-0"
          >
            Retry
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setDismissedAt(summary.pending)}
            className="shrink-0 p-1 -mr-1"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {toast && (
        <div
          className="fixed z-50 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-navy-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
          role="status"
        >
          <CloudUpload size={15} className="text-gold-400" />
          {toast}
        </div>
      )}
    </>
  )
}
