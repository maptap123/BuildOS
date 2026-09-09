'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The Fixer conversation, without the chrome
 * =========================================
 * Both Fixer surfaces — the floating panel and the one built into the Estimate
 * Builder — talk to the same SSE endpoint and parse the same five event types. That
 * loop lived twice already and the copies had drifted (one had no abort, no error
 * branch), so it lives here now and the panels only decide how it looks.
 *
 * `elapsedMs` exists because the gateway answers in one shot: an estimating turn can
 * sit silent for minutes, and a spinner with no clock reads as a hang.
 */

export interface FixerChatMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** Set when the turn ended in an error, so the panel can offer a retry. */
  failed?: boolean
}

interface UseFixerChatOptions {
  jobId?: string
  /** Scopes the turn to one estimate — tools read it to know what is open. */
  estimateId?: string
  /** Resumes a thread, e.g. one restored from sessionStorage. */
  initialConversationId?: string
  /** Fires once a turn lands successfully. The estimate panel refetches lines here. */
  onTurnComplete?: () => void
  /** Fixer asked for a route change. Omit to ignore navigation entirely. */
  onNavigate?: (url: string, label?: string) => void
  /** Called when a new thread is created, so callers can persist the id. */
  onConversationId?: (id: string) => void
}

export function useFixerChat({
  jobId,
  estimateId,
  initialConversationId,
  onTurnComplete,
  onNavigate,
  onConversationId,
}: UseFixerChatOptions = {}) {
  const [messages, setMessages] = useState<FixerChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId)

  const abortRef = useRef<AbortController | null>(null)

  // Callbacks come from render bodies; holding them in a ref keeps `send` stable so a
  // parent re-render mid-turn cannot swap the closure out from under an open stream.
  const handlers = useRef({ onTurnComplete, onNavigate, onConversationId })
  useEffect(() => {
    handlers.current = { onTurnComplete, onNavigate, onConversationId }
  }, [onTurnComplete, onNavigate, onConversationId])

  useEffect(() => {
    if (!loading) return
    const startedAt = Date.now()
    setElapsedMs(0)
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(t)
  }, [loading])

  const replaceLast = useCallback((msg: FixerChatMessage) => {
    setMessages(prev => {
      const next = [...prev]
      if (next.length > 0) next[next.length - 1] = msg
      return next
    })
  }, [])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return

    setInput('')
    setMessages(prev => [
      ...prev,
      { role: 'user', content: msg },
      { role: 'assistant', content: '', streaming: true },
    ])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    let turnFailed = false

    try {
      const res = await fetch('/api/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversation_id: conversationId,
          job_id: jobId,
          estimate_id: estimateId,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Failed to reach Fixer' }))
        replaceLast({ role: 'assistant', content: err.error ?? 'Something went wrong.', failed: true })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: Record<string, string>
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue // malformed SSE line
          }

          switch (event.type) {
            case 'delta':
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + event.text, streaming: true }
                }
                return next
              })
              break

            case 'ping':
              break // the connection is alive; the elapsed ticker already covers the UI

            case 'navigate':
              handlers.current.onNavigate?.(event.url, event.label)
              break

            case 'done':
              if (event.conversationId) {
                setConversationId(event.conversationId)
                handlers.current.onConversationId?.(event.conversationId)
              }
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, streaming: false }
                return next
              })
              break

            case 'error':
              turnFailed = true
              replaceLast({
                role: 'assistant',
                content: event.message ?? 'Fixer encountered an error.',
                failed: true,
              })
              break
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        turnFailed = true
        replaceLast({ role: 'assistant', content: 'Stopped.', failed: true })
        return
      }
      turnFailed = true
      replaceLast({ role: 'assistant', content: 'Connection lost. Please try again.', failed: true })
    } finally {
      setLoading(false)
      abortRef.current = null
      if (!turnFailed) handlers.current.onTurnComplete?.()
    }
  }, [loading, conversationId, jobId, estimateId, replaceLast])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Drops the thread so the next turn starts a fresh conversation. */
  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setConversationId(undefined)
    setInput('')
  }, [])

  return { messages, input, setInput, loading, elapsedMs, conversationId, send, stop, reset }
}

/** `elapsedMs` as `1:07`, for the "still working" line. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
