'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CloudUpload, Camera } from 'lucide-react'
import { LOG_DRAFT_SYNCED_EVENT } from '@/lib/logDrafts'
import { listPendingLogs, retryOutbox, LOG_OUTBOX_STATUS_EVENT, type PendingLog } from '@/lib/logOutbox'

/**
 * Daily logs that are saved on this phone but haven't finished uploading
 * (bad signal). Shown at the top of the log list as "Pending upload"; they
 * retry on their own and turn into normal logs once they reach the server.
 */
export function PendingLogCards({ jobId }: { jobId?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingLog[]>([])

  useEffect(() => {
    let alive = true
    let hadPending = false
    async function refresh() {
      try {
        const all = await listPendingLogs()
        if (!alive) return
        const mine = jobId ? all.filter(p => p.job_id === jobId) : all
        // Something just finished uploading → reload the real list
        if (hadPending && mine.length === 0) router.refresh()
        hadPending = mine.length > 0
        setPending(mine)
      } catch {
        // IndexedDB unavailable — nothing to show
      }
    }
    refresh()
    const id = setInterval(refresh, 4000)
    window.addEventListener(LOG_OUTBOX_STATUS_EVENT, refresh)
    window.addEventListener(LOG_DRAFT_SYNCED_EVENT, refresh)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener(LOG_OUTBOX_STATUS_EVENT, refresh)
      window.removeEventListener(LOG_DRAFT_SYNCED_EVENT, refresh)
    }
  }, [jobId, router])

  if (pending.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {pending.map(p => (
        <div key={p.id} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CloudUpload size={15} className="text-amber-700 shrink-0" />
            <span className="text-sm font-semibold text-[#1b2b4a] truncate flex-1">
              {p.job_name ?? 'Daily log'} · {p.log_date}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full shrink-0">
              {p.failed ? 'Needs attention' : 'Pending upload'}
            </span>
          </div>
          {p.work_performed && (
            <p className="mt-1.5 text-sm text-gray-600 line-clamp-3 whitespace-pre-wrap">{p.work_performed}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-amber-900">
            {p.photos > 0 && (
              <span className="flex items-center gap-1">
                <Camera size={12} /> {p.photos} photo{p.photos !== 1 ? 's' : ''} waiting
              </span>
            )}
            <span className="flex-1">
              {p.failed
                ? p.message
                : 'Saved on this phone — uploads automatically when signal is better.'}
            </span>
            <button
              type="button"
              onClick={() => { retryOutbox().catch(() => {}) }}
              className="font-semibold underline shrink-0"
            >
              Retry now
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
