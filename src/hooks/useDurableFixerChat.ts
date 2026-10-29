'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FixerChatMessage } from './useFixerChat'

interface ResearchRequest { id: string; status: string; result?: string | null }
interface ChatMessage extends FixerChatMessage { requestId?: string; turnId?: string }

/** Floating general chat only. The estimate builder has its own worker UI. */
export function useDurableFixerChat({ jobId, active, onNavigate }: { jobId?: string; active: boolean; onNavigate?: (url: string) => void }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const owner = useRef<string | null>(null)
  const generation = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const conversation = useRef<string | undefined>(undefined)

  const [refresh, setRefresh] = useState(0)
  const invalidateSession = useCallback(() => {
    generation.current++
    owner.current = null
    abort.current?.abort()
  }, [])
  const clearSession = useCallback(() => {
    invalidateSession()
    busy.current = false
    conversation.current = undefined
    setUserId(null); setMessages([]); setRequests([]); setInput(''); setLoading(false)
  }, [invalidateSession])

  useEffect(() => {
    let alive = true
    let identityRead = 0
    async function identify(clear = false) {
      if (clear) clearSession()
      const read = ++identityRead
      try {
        const response = await fetch('/api/me/profile', { cache: 'no-store' })
        const profile = response.ok ? await response.json() : null
        if (!alive || read !== identityRead) return
        if (typeof profile?.id !== 'string' || !profile.id) { clearSession(); return }
        if (owner.current && owner.current !== profile.id) clearSession()
        if (!owner.current) {
          owner.current = profile.id
          // Only opaque metadata is cached. Answers always require a fresh,
          // authenticated read; cache ids never confer authorization.
          try {
            const saved = JSON.parse(localStorage.getItem(`buildos:fixer:${profile.id}`) ?? '{}')
            if (typeof saved.conversationId === 'string') conversation.current = saved.conversationId
          } catch { /* Storage may be disabled or malformed. */ }
          setUserId(profile.id)
        }
        setRefresh(previous => previous + 1)
      } catch { if (alive && read === identityRead) clearSession() }
    }
    void identify()
    const focus = () => { void identify() }
    window.addEventListener('focus', focus)
    const { data: { subscription } } = createClient().auth.onAuthStateChange(() => { void identify(true) })
    return () => { alive = false; invalidateSession(); subscription.unsubscribe(); window.removeEventListener('focus', focus) }
  }, [clearSession, invalidateSession])

  useEffect(() => {
    if (!userId) return
    const epoch = generation.current
    let disposed = false
    let inFlight = false
    async function poll() {
      if (inFlight || disposed) return
      inFlight = true
      try {
        const response = await fetch('/api/hermes/privacy-requests', { cache: 'no-store' })
        if (response.status === 401 || response.status === 403) {
          if (!disposed && epoch === generation.current) clearSession()
          return
        }
        if (!response.ok) return
        const rows = await response.json()
        if (disposed || epoch !== generation.current || owner.current !== userId || !Array.isArray(rows)) return
        const safeRows: ResearchRequest[] = rows.filter(row => row && typeof row.id === 'string' && typeof row.status === 'string')
          .map(row => ({ id: row.id, status: row.status, result: row.status === 'completed' && typeof row.result === 'string' ? row.result : null }))
        setRequests(safeRows)
        setMessages(previous => {
          // Remove answers no longer authorized, and upsert by the server request id.
          const next = previous.filter(message => !message.requestId || safeRows.some(row => row.id === message.requestId && row.status === 'completed' && row.result))
          for (const row of safeRows) {
            if (row.status !== 'completed' || !row.result) continue
            const index = next.findIndex(message => message.requestId === row.id)
            const answer: ChatMessage = { role: 'assistant', content: row.result, requestId: row.id }
            if (index < 0) next.push(answer)
            else next[index] = answer
          }
          return next
        })
        try {
          localStorage.setItem(`buildos:fixer:${userId}`, JSON.stringify({ conversationId: conversation.current,
            completedRequestIds: safeRows.filter(row => row.status === 'completed').map(row => row.id) }))
        } catch { /* Research recovery must work even without local storage. */ }
      } catch { /* Polling retries; never reveal raw server errors. */ }
      finally { inFlight = false }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 3000)
    return () => { disposed = true; clearInterval(timer) }
  }, [userId, refresh, active, clearSession])

  useEffect(() => {
    if (!loading) return
    const started = Date.now()
    const timer = setInterval(() => setElapsedMs(Date.now() - started), 1000)
    return () => clearInterval(timer)
  }, [loading])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy.current || !owner.current) return
    const epoch = generation.current
    const current = () => epoch === generation.current && owner.current !== null
    const turnId = crypto.randomUUID()
    busy.current = true; setLoading(true); setElapsedMs(0); setInput('')
    setMessages(prev => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '', streaming: true, turnId }])
    const controller = new AbortController()
    abort.current = controller
    const replace = (content: string, failed = false) => {
      if (current()) setMessages(prev => prev.map(row => row.turnId === turnId ? { role: 'assistant', content, failed, turnId } : row))
    }
    try {
      const response = await fetch('/api/hermes/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: conversation.current, job_id: jobId }), signal: controller.signal })
      if (!response.ok || !response.body) { replace('Fixer could not accept that question. Please try again.', true); return }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let queued = false
      let terminal = false
      for (;;) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        if (done && buffer) lines.push(buffer)
        for (const line of lines) {
          if (!current() || !line.startsWith('data:')) continue
          let event
          try { event = JSON.parse(line.slice(5).trim()) } catch { continue }
          if (event.type === 'queued' && typeof event.requestId === 'string') {
            queued = true
            terminal = true
            const status = ['queued', 'running', 'held'].includes(event.status) ? event.status : 'queued'
            setRequests(prev => [...prev.filter(row => row.id !== event.requestId), { id: event.requestId, status }])
            replace('Your question is saved. You can close the app; the answer will be saved here.' +
              (event.smsEnabled === true ? ' Text updates are enabled for your account.' : ''))
          } else if (event.type === 'delta' && typeof event.text === 'string') {
            setMessages(prev => prev.map(row => row.turnId === turnId ? { ...row, content: row.content + event.text } : row))
          } else if (event.type === 'done') {
            terminal = true
            if (typeof event.conversationId === 'string') {
              conversation.current = event.conversationId
              try {
                const key = `buildos:fixer:${owner.current}`
                const saved = JSON.parse(localStorage.getItem(key) ?? '{}')
                localStorage.setItem(key, JSON.stringify({ conversationId: event.conversationId,
                  completedRequestIds: Array.isArray(saved.completedRequestIds) ? saved.completedRequestIds.filter((id: unknown) => typeof id === 'string') : [] }))
              } catch { /* No answer text is cached; storage is optional. */ }
            }
            if (!queued && typeof event.requestId === 'string') {
              setMessages(previous => {
                if (previous.some(row => row.requestId === event.requestId)) return previous.filter(row => row.turnId !== turnId)
                return previous.map(row => row.turnId === turnId ? { ...row, requestId: event.requestId } : row)
              })
            }
          } else if (event.type === 'navigate' && typeof event.url === 'string' && event.url.startsWith('/') && !event.url.startsWith('//')) {
            onNavigate?.(event.url)
          } else if (event.type === 'error') { terminal = true; replace('Fixer encountered an error. Please try again.', true) }
        }
        if (done) break
      }
      if (!terminal) replace('Connection lost. Reopen Fixer to check saved research before trying again.', true)
    } catch {
      replace(controller.signal.aborted ? 'Stopped listening. Saved research can still finish here.' : 'Connection lost. Reopen Fixer to check saved research before trying again.', true)
    } finally {
      if (current()) {
        busy.current = false; abort.current = null; setLoading(false)
        setMessages(prev => prev.map(row => row.streaming ? { ...row, streaming: false } : row))
      }
    }
  }, [jobId, onNavigate])
  const stop = useCallback(() => { abort.current?.abort() }, [])
  return { messages, requests, input, setInput, loading, elapsedMs, send, stop, ready: userId !== null }
}
