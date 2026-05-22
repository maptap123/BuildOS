'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, Bot } from 'lucide-react'
import { usePathname } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

function extractJobId(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'jobs' && segments[1] && segments[1].length > 8) return segments[1]
  return undefined
}

const QUICK_PROMPTS = [
  "What's overdue on this job?",
  "Summarize today's tasks",
  "Show me the budget snapshot",
  "What's scheduled this week?",
]

export function HermesChatPanel() {
  const pathname = usePathname()
  const jobId = extractJobId(pathname)

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    // Append a streaming assistant message placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversation_id: conversationId, job_id: jobId }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Failed to reach Hermes' }))
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: err.error ?? 'Something went wrong.' }
          return next
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'delta') {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + event.text, streaming: true }
                }
                return next
              })
            }

            if (event.type === 'done') {
              setConversationId(event.conversationId)
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, streaming: false }
                }
                return next
              })
            }

            if (event.type === 'error') {
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: event.message ?? 'Hermes encountered an error.' }
                return next
              })
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: 'Connection lost. Please try again.' }
        return next
      })
    } finally {
      setLoading(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [loading, conversationId, jobId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function handleClose() {
    abortRef.current?.abort()
    setOpen(false)
  }

  return (
    <>
      {/* ── Floating button ── */}
      <button
        aria-label="Open Hermes AI"
        onClick={() => setOpen(true)}
        className={`
          fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40
          w-12 h-12 rounded-full shadow-lg
          bg-gold-500 hover:bg-gold-600 text-navy-900
          flex items-center justify-center
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-2
          ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
      >
        <MessageCircle size={20} />
      </button>

      {/* ── Backdrop (mobile) ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={handleClose}
        />
      )}

      {/* ── Chat panel ── */}
      <div
        className={`
          fixed z-50 flex flex-col
          bg-white shadow-2xl
          transition-all duration-300 ease-out
          /* Mobile: slide up from bottom, full width */
          inset-x-0 bottom-0 rounded-t-2xl max-h-[85dvh]
          /* Desktop: fixed bottom-right panel */
          md:inset-x-auto md:right-6 md:bottom-6 md:w-[400px] md:h-[600px] md:max-h-[85vh] md:rounded-2xl
          ${open ? 'translate-y-0 opacity-100' : 'translate-y-full md:translate-y-4 opacity-0 pointer-events-none'}
        `}
        role="dialog"
        aria-label="Hermes AI Chat"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center shrink-0">
            <Bot size={16} className="text-gold-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-navy-900 text-sm leading-none">Hermes</p>
            <p className="text-[10px] text-gray-400 mt-0.5">JDC AI Assistant</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-navy-900 transition-colors p-1"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
              <div className="w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center">
                <Bot size={24} className="text-navy-900" />
              </div>
              <div>
                <p className="font-display font-semibold text-navy-900 text-sm">Hi, I&apos;m Hermes</p>
                <p className="text-xs text-gray-400 mt-1">Ask me anything about your jobs, tasks, or schedule.</p>
              </div>
              <div className="flex flex-col gap-2 w-full mt-2">
                {QUICK_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gold-400 hover:text-navy-900 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-navy-900 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={12} className="text-gold-400" />
                </div>
              )}
              <div
                className={`
                  max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-navy-900 text-white rounded-br-sm'
                    : 'bg-gray-100 text-navy-900 rounded-bl-sm'
                  }
                `}
              >
                {msg.content || (msg.streaming && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-xs">Thinking…</span>
                  </span>
                ))}
                {msg.streaming && msg.content && (
                  <span className="inline-block w-0.5 h-4 bg-navy-400 ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-gray-100">
          <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Hermes…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-navy-900 placeholder-gray-400 resize-none outline-none max-h-32 leading-5 py-0.5 disabled:opacity-50"
              style={{ height: 'auto' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg bg-gold-500 hover:bg-gold-600 text-navy-900 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              {loading
                ? <Loader2 size={14} className="animate-spin" />
                : <Send size={14} />
              }
            </button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-1.5">Hermes can make mistakes — verify important info</p>
        </div>
      </div>
    </>
  )
}
