'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, FileText, Calendar, Clock, Folder, ChevronRight, CheckSquare, AlertCircle } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAgenda } from '@/hooks/useAgenda'
import { useActiveJob } from '@/contexts/ActiveJobContext'
import { LogModePicker } from './LogModePicker'

// Props kept for backward compatibility; jobId/jobName are now sourced from context
interface Props {
  jobId?: string | null
  jobName?: string | null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function dayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  return name.split(' ')[0]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MobileHome(_props: Props) {
  const router = useRouter()
  const { user } = useCurrentUser()
  const agenda = useAgenda()

  // Active job context — shared with layout picker, persisted across boots
  const { activeJob, activeJobId } = useActiveJob()
  const jobId = activeJobId
  const jobName = activeJob?.name ?? null

  const [logPickerOpen, setLogPickerOpen] = useState(false)
  const [hermesForcedOpen, setHermesForcedOpen] = useState(false)

  const totalAlerts = agenda.past_due.length + agenda.due_today.length

  function handleSchedule() {
    // If we have an active job context, go directly — no picker needed
    if (jobId) {
      router.push(`/jobs/${jobId}/schedule`)
    } else {
      // No active job set yet — the layout top-bar picker handles this;
      // the user can tap the job name in the header to pick a job first.
      // As a fallback, go to All Jobs so they can pick from there.
      router.push('/jobs')
    }
  }

  function handleDocuments() {
    router.push('/documents')
  }


  return (
    <div className="min-h-screen bg-[#f0ede8] pb-32">

      {/* ── Hero section ── */}
      <div
        className="px-5 pt-6 pb-8"
        style={{
          background: 'linear-gradient(160deg, #1b2b4a 0%, #0b1623 100%)',
        }}
      >
        {/* Greeting */}
        <div className="mb-6">
          <p className="text-[#d4a83c] text-xs font-semibold tracking-[0.18em] uppercase mb-1">
            {dayLabel()}
          </p>
          <h1 className="font-display text-3xl font-bold text-white leading-tight">
            {greeting()}{user?.full_name ? `, ${firstName(user.full_name)}` : ''}
          </h1>
          {jobName && (
            <p className="text-[#4d6a9a] text-sm mt-1.5">
              Active: <span className="text-[#d4a83c] font-medium">{jobName}</span>
            </p>
          )}
        </div>

        {/* Hermes hero button */}
        <button
          onClick={() => setHermesForcedOpen(true)}
          className="w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #243558 0%, #1b2b4a 60%, #0f1d36 100%)',
            border: '1px solid rgba(212,168,60,0.3)',
            boxShadow: '0 0 0 0 rgba(212,168,60,0), 0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #c09030, #d4a83c)',
                boxShadow: '0 0 16px rgba(192,144,48,0.4)',
              }}
            >
              <Bot size={22} className="text-[#0b1623]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">Talk to Fixer</p>
              <p className="text-[#4d6a9a] text-xs mt-0.5 truncate">
                &ldquo;Did we order the parts for the Ryan job?&rdquo;
              </p>
            </div>
            <ChevronRight size={18} className="text-[#d4a83c] shrink-0" />
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {["My tasks today", "What's overdue?", "Start a log"].map(chip => (
              <span
                key={chip}
                className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(212,168,60,0.12)',
                  color: '#d4a83c',
                  border: '1px solid rgba(212,168,60,0.2)',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </button>

        {/* Alert strip */}
        {!agenda.loading && totalAlerts > 0 && (
          <div
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-xs">
              {agenda.past_due.length > 0 && `${agenda.past_due.length} overdue`}
              {agenda.past_due.length > 0 && agenda.due_today.length > 0 && ' · '}
              {agenda.due_today.length > 0 && `${agenda.due_today.length} due today`}
            </p>
          </div>
        )}
      </div>

      {/* ── Action tiles ── */}
      <div className="px-4 -mt-4">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid rgba(226,221,214,0.8)',
          }}
        >
          <div className="grid grid-cols-2">

            {/* Daily Log */}
            <button
              onClick={() => setLogPickerOpen(true)}
              className="flex flex-col items-start gap-2 p-5 bg-white transition-all active:bg-[#f8f7f4] active:scale-[0.98] border-r border-b border-[#e2ddd6]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <FileText size={20} className="text-[#d4a83c]" />
              </div>
              <div>
                <p className="font-bold text-[#1b2b4a] text-base leading-tight">Daily Log</p>
                <p className="text-[#4d6a9a] text-xs mt-0.5">Traditional or AI</p>
              </div>
            </button>

            {/* Schedule */}
            <button
              onClick={handleSchedule}
              className="flex flex-col items-start gap-2 p-5 bg-white transition-all active:bg-[#f8f7f4] active:scale-[0.98] border-b border-[#e2ddd6]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <Calendar size={20} className="text-[#d4a83c]" />
              </div>
              <div>
                <p className="font-bold text-[#1b2b4a] text-base leading-tight">Schedule</p>
                <p className="text-[#4d6a9a] text-xs mt-0.5">
                  {jobName ?? 'Select a job'}
                </p>
              </div>
            </button>

            {/* Time Clock */}
            <button
              onClick={() => router.push('/time-clock')}
              className="flex flex-col items-start gap-2 p-5 bg-white transition-all active:bg-[#f8f7f4] active:scale-[0.98] border-r border-[#e2ddd6]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <Clock size={20} className="text-[#d4a83c]" />
              </div>
              <div>
                <p className="font-bold text-[#1b2b4a] text-base leading-tight">Time Clock</p>
                <p className="text-[#4d6a9a] text-xs mt-0.5">Clock in / Switch job</p>
              </div>
            </button>

            {/* Documents */}
            <button
              onClick={handleDocuments}
              className="flex flex-col items-start gap-2 p-5 bg-white transition-all active:bg-[#f8f7f4] active:scale-[0.98] border-[#e2ddd6]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <Folder size={20} className="text-[#d4a83c]" />
              </div>
              <div>
                <p className="font-bold text-[#1b2b4a] text-base leading-tight">Documents</p>
                <p className="text-[#4d6a9a] text-xs mt-0.5">
                  {jobName ?? 'All documents'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Today's tasks ── */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-[#1b2b4a]" />
            <h2 className="font-bold text-[#1b2b4a] text-base">Today&apos;s Tasks</h2>
          </div>
          {!agenda.loading && agenda.due_today.length > 0 && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#1b2b4a', color: '#d4a83c' }}
            >
              {agenda.due_today.length}
            </span>
          )}
        </div>

        {agenda.loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl bg-white animate-pulse" />
            ))}
          </div>
        ) : agenda.due_today.length === 0 && agenda.past_due.length === 0 ? (
          <div className="rounded-xl bg-white border border-[#e2ddd6] px-4 py-5 text-center">
            <p className="text-[#4d6a9a] text-sm">Nothing due today — you&apos;re clear.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agenda.past_due.slice(0, 3).map(task => (
              <button
                key={task.id}
                onClick={() => router.push(`/jobs/${task.job_id}/tasks`)}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-red-100 px-4 py-3 text-left transition-all active:scale-[0.99]"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              >
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1b2b4a] text-sm truncate">{task.title}</p>
                  <p className="text-[#4d6a9a] text-xs truncate">{task.job_name} · Overdue</p>
                </div>
                <ChevronRight size={16} className="text-[#4d6a9a] shrink-0" />
              </button>
            ))}
            {agenda.due_today.slice(0, 3).map(task => (
              <button
                key={task.id}
                onClick={() => router.push(`/jobs/${task.job_id}/tasks`)}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-[#e2ddd6] px-4 py-3 text-left transition-all active:scale-[0.99]"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              >
                <div className="w-2 h-2 rounded-full bg-[#c09030] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1b2b4a] text-sm truncate">{task.title}</p>
                  <p className="text-[#4d6a9a] text-xs truncate">{task.job_name}</p>
                </div>
                <ChevronRight size={16} className="text-[#4d6a9a] shrink-0" />
              </button>
            ))}
            {(agenda.past_due.length + agenda.due_today.length) > 6 && (
              <button
                onClick={() => router.push(jobId ? `/jobs/${jobId}/tasks` : '/jobs')}
                className="w-full text-center py-3 text-sm font-semibold text-[#1b2b4a]"
              >
                View all {agenda.past_due.length + agenda.due_today.length} tasks →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── This week schedule ── */}
      {!agenda.loading && agenda.this_week.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-[#1b2b4a]" />
            <h2 className="font-bold text-[#1b2b4a] text-base">This Week</h2>
          </div>
          <div className="space-y-2">
            {agenda.this_week.slice(0, 4).map(item => (
              <button
                key={item.id}
                onClick={() => router.push(`/jobs/${item.job_id}/schedule`)}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-[#e2ddd6] px-4 py-3 text-left transition-all active:scale-[0.99]"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              >
                <div className="w-2 h-2 rounded-full bg-[#3a5280] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1b2b4a] text-sm truncate">{item.title}</p>
                  <p className="text-[#4d6a9a] text-xs truncate">{item.job_name}</p>
                </div>
                <ChevronRight size={16} className="text-[#4d6a9a] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Log mode picker */}
      {logPickerOpen && (
        <LogModePicker
          jobId={jobId}
          onClose={() => setLogPickerOpen(false)}
        />
      )}

      {/* Hermes panel — forced open when hero button tapped */}
      {hermesForcedOpen && (
        <HermesForcedPanel onDismiss={() => setHermesForcedOpen(false)} />
      )}
    </div>
  )
}

function HermesForcedPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white overflow-hidden" style={{ maxHeight: '85dvh' }}>
        <HermesChatPanelInline onClose={onDismiss} />
      </div>
    </div>
  )
}

function HermesChatPanelInline({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; streaming?: boolean }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const router = useRouter()

  const QUICK_PROMPTS = [
    "What are my tasks today?",
    "What's overdue on this job?",
    "Show me the schedule",
    "Did we log today?",
  ]

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    try {
      const res = await fetch('/api/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversation_id: conversationId }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Failed to reach Fixer' }))
        setMessages(prev => { const n=[...prev]; n[n.length-1]={role:'assistant',content:err.error??'Something went wrong.'}; return n })
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
              setMessages(prev => { const n=[...prev]; const last=n[n.length-1]; if(last?.role==='assistant') n[n.length-1]={...last,content:last.content+event.text,streaming:true}; return n })
            }
            if (event.type === 'navigate') { router.push(event.url); setTimeout(onClose, 400) }
            if (event.type === 'done') { setConversationId(event.conversationId); setMessages(prev => { const n=[...prev]; const last=n[n.length-1]; if(last?.role==='assistant') n[n.length-1]={...last,streaming:false}; return n }) }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch { /* swallow */ } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '85dvh' }}>
      {/* Handle bar */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-200" />
      </div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#1b2b4a' }}>
          <Bot size={16} className="text-[#d4a83c]" />
        </div>
        <div className="flex-1">
          <p className="font-display font-bold text-[#1b2b4a] text-sm leading-none">Hermes</p>
          <p className="text-[10px] text-gray-400 mt-0.5">JDC AI Assistant</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-[#1b2b4a] p-1 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#c09030,#d4a83c)', boxShadow:'0 0 20px rgba(192,144,48,0.3)' }}>
              <Bot size={28} className="text-[#0b1623]" />
            </div>
            <div>
              <p className="font-display font-bold text-[#1b2b4a] text-base">Hi, I&apos;m Fixer</p>
              <p className="text-sm text-gray-500 mt-1">Ask me anything about your jobs, tasks, or schedule.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)} className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 text-gray-600 hover:border-[#d4a83c] hover:text-[#1b2b4a] transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: '#1b2b4a' }}>
                <Bot size={12} className="text-[#d4a83c]" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${msg.role==='user' ? 'text-white rounded-br-sm' : 'bg-gray-100 text-[#1b2b4a] rounded-bl-sm'}`} style={msg.role==='user' ? { background: '#1b2b4a' } : {}}>
              {msg.content || (msg.streaming && <span className="text-gray-400 text-xs">Thinking…</span>)}
            </div>
          </div>
        ))}
      </div>
      {/* Input */}
      <div className="shrink-0 px-3 pb-6 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input) }}
            placeholder="Ask Fixer…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-[#1b2b4a] placeholder-gray-400 outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
            style={{ background: '#c09030' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b1623" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
