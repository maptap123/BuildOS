'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import type { ShareComment } from '@/lib/selections/share'

const NAME_KEY = 'selection-share-name'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * The comment thread for a job's selections. Used twice: on the public share page
 * (mode "client" — asks for a name, talks to the token API) and inside BuildOS
 * (mode "staff" — replies as the signed-in user). Polls so replies show up live.
 */
export function CommentsPanel({
  mode, listUrl, postUrl, selections, onUnread,
}: {
  mode: 'client' | 'staff'
  listUrl: string
  postUrl: string
  selections: { id: string; title: string }[]
  onUnread?: (n: number) => void
}) {
  const [comments, setComments] = useState<ShareComment[]>([])
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    try { setName(localStorage.getItem(NAME_KEY) ?? '') } catch { /* storage unavailable */ }
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(listUrl, { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    setComments(json.comments ?? [])
    onUnread?.(json.unread ?? 0)
  }, [listUrl, onUnread])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (comments.length !== lastCount.current) {
      lastCount.current = comments.length
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [comments])

  const titleOf = (id: string | null) => selections.find(s => s.id === id)?.title

  async function send() {
    if (!text.trim() || sending) return
    if (mode === 'client' && !name.trim()) { setError('Please enter your name'); return }
    setSending(true)
    setError('')
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text, name, selection_id: about || null }),
    })
    setSending(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not send'); return }
    if (mode === 'client') { try { localStorage.setItem(NAME_KEY, name.trim()) } catch { /* ignore */ } }
    setText('')
    await load()
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
        {comments.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            {mode === 'client'
              ? 'Questions or changes? Leave a note here and the JDC team will reply.'
              : 'No comments yet. Anything the client writes on the shared link shows up here.'}
          </p>
        )}
        {comments.map(c => {
          const mine = c.author_type === (mode === 'client' ? 'client' : 'staff')
          return (
            <div key={c.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                mine ? 'bg-navy-900 text-white' : 'bg-gray-100 text-navy-900'}`}>
                {c.selection_id && titleOf(c.selection_id) && (
                  <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${mine ? 'text-white/70' : 'text-gray-500'}`}>
                    Re: {titleOf(c.selection_id)}
                  </p>
                )}
                {c.body}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5 px-1">
                {c.author_name}{c.author_type === 'staff' && mode === 'staff' ? '' : c.author_type === 'staff' ? ' · JDC' : ''} · {when(c.created_at)}
              </p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {mode === 'client' && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        )}
        {selections.length > 0 && (
          <select
            value={about}
            onChange={e => setAbout(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="">About: everything</option>
            {selections.map(s => <option key={s.id} value={s.id}>About: {s.title}</option>)}
          </select>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            rows={2}
            maxLength={2000}
            placeholder={mode === 'client' ? 'Write a comment…' : 'Reply…'}
            className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="self-end rounded-lg bg-navy-900 text-white p-2.5 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
