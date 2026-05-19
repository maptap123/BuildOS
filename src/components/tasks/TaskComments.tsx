'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, Trash2, MessageSquare } from 'lucide-react'
import type { TaskComment } from '@/types'

interface Props {
  taskId: string
  currentUserId: string
}

function fmtRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function TaskComments({ taskId, currentUserId }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loading, setLoading]   = useState(true)
  const [body, setBody]         = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`)
      if (res.ok) setComments(await res.json())
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      if (res.ok) {
        setBody('')
        load()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm('Delete this comment?')) return
    await fetch(`/api/tasks/${taskId}/comments?comment_id=${commentId}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={14} className="text-gray-400" />
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Comments {comments.length > 0 && `(${comments.length})`}
        </h4>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-2">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">No comments yet</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map(comment => {
            const name = comment.author?.full_name ?? null
            const email = comment.author?.email ?? '??'
            const isOwn = comment.created_by === currentUserId
            return (
              <div key={comment.id} className="flex items-start gap-2.5">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-navy-700">{initials(name, email)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-navy-800">{name ?? email}</span>
                    <span className="text-[10px] text-gray-400">{fmtRelative(comment.created_at)}</span>
                    {isOwn && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e) }}
          rows={2}
          placeholder="Add a comment… (Ctrl+Enter to send)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-300 placeholder-gray-300"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-40 transition-colors shrink-0"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}
