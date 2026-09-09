'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FixerChatMessage } from './useFixerChat'

interface SavedRequest {
  id: string; estimate_id: string; message: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: string; result: string | null; error: string | null
  created_at: string; started_at: string | null
}

export function useEstimateFixer(estimateId: string, onComplete: () => void) {
  const [rows, setRows] = useState<SavedRequest[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const complete = useRef(onComplete)
  const scope = useRef(estimateId)
  const pending = useRef<{ id: string; message: string } | null>(null)
  const sending = useRef(false)
  const statuses = useRef(new Map<string, string>())
  useEffect(() => { complete.current = onComplete }, [onComplete])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/hermes/requests?estimate_id=${estimateId}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error('Could not refresh saved Fixer requests. Reconnecting…')
    const next: SavedRequest[] = await res.json()
    if (scope.current !== estimateId) return
    for (const r of next) {
      if (['completed', 'failed'].includes(r.status) && statuses.current.get(r.id) !== r.status) complete.current()
    }
    statuses.current = new Map(next.map(r => [r.id, r.status]))
    setRows(next); setReady(true); setLoadError(null)
  }, [estimateId])

  useEffect(() => {
    scope.current = estimateId
    setRows([]); setReady(false); setInput(''); setError(null); setLoadError(null); setSubmitting(false)
    pending.current = null; sending.current = false; statuses.current.clear()
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { await refresh() } catch { if (!disposed) setLoadError('Could not refresh saved Fixer requests. Reconnecting…') }
      if (!disposed) timer = setTimeout(poll, 4000)
    }
    void poll()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { disposed = true; clearTimeout(timer); clearInterval(clock); scope.current = '' }
  }, [estimateId, refresh])

  const active = rows.find(r => r.status === 'queued' || r.status === 'running')
  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || sending.current || !ready || active) return
    sending.current = true; setSubmitting(true); setError(null)
    if (pending.current?.message !== message) pending.current = { id: crypto.randomUUID(), message }
    try {
      const res = await fetch('/api/hermes/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending.current, estimate_id: estimateId }),
        signal: AbortSignal.timeout(20000),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not submit request')
      if (scope.current !== estimateId) return
      setRows(prev => prev.some(r => r.id === body.id) ? prev : [...prev, body])
      pending.current = null; setInput('')
      await refresh()
    } catch (e) {
      if (scope.current === estimateId) setError(e instanceof Error ? e.message : 'Submission was not confirmed. Retry this message to check the same request.')
    } finally {
      if (scope.current === estimateId) { sending.current = false; setSubmitting(false) }
    }
  }, [active, ready, estimateId, refresh])

  const messages: FixerChatMessage[] = rows.flatMap(r => [
    { role: 'user', content: r.message },
    { role: 'assistant', content: r.status === 'completed' ? r.result ?? '' : r.status === 'failed'
      ? r.error ?? 'Fixer could not finish. Review proposed lines before trying again.' : r.progress,
    failed: r.status === 'failed' },
  ])
  return { messages, input, setInput, send, error: error ?? loadError, ready,
    loading: submitting || !!active || !ready,
    elapsedMs: active ? Math.max(0, now - Date.parse(active.started_at ?? active.created_at)) : 0,
    status: active?.progress ?? (submitting ? 'Saving your request…' : !ready ? 'Loading saved requests…' : null),
  }
}
