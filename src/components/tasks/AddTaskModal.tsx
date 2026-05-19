'use client'

import { useState } from 'react'
import { X, Tag, Clock } from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types'
import { TaskComments } from './TaskComments'

interface Props {
  jobId: string
  task?: Task | null
  currentUserId?: string
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string
  estimated_hours: string
  actual_hours: string
  tags: string
}

export function AddTaskModal({ jobId, task, currentUserId, onClose, onSaved }: Props) {
  const isEdit = Boolean(task)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details')

  const [form, setForm] = useState<FormState>({
    title:           task?.title ?? '',
    description:     task?.description ?? '',
    status:          task?.status ?? 'todo',
    priority:        task?.priority ?? 'medium',
    due_date:        task?.due_date ?? '',
    estimated_hours: task?.estimated_hours != null ? String(task.estimated_hours) : '',
    actual_hours:    task?.actual_hours    != null ? String(task.actual_hours)    : '',
    tags:            task?.tags?.join(', ') ?? '',
  })

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const tags = form.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const payload = {
        ...(isEdit ? { id: task!.id } : { job_id: jobId }),
        title:           form.title.trim(),
        description:     form.description.trim() || null,
        status:          form.status,
        priority:        form.priority,
        due_date:        form.due_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        actual_hours:    form.actual_hours    ? Number(form.actual_hours)    : null,
        tags,
      }
      const res = await fetch('/api/tasks', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl md:rounded-t-xl">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Task' : 'Add Task'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab switcher (only in edit mode with an existing task) */}
        {isEdit && task && (
          <div className="flex gap-1 px-6 pt-3 pb-0">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'details' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'comments' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              Comments
            </button>
          </div>
        )}

        {activeTab === 'comments' && isEdit && task && currentUserId ? (
          <div className="px-6 py-4">
            <TaskComments taskId={task.id} currentUserId={currentUserId} />
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Title *</label>
              <input
                required
                autoFocus
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="What needs to be done?"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={2}
                placeholder="Optional details..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => set('priority', e.target.value as TaskPriority)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value as TaskStatus)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>

            {/* Time tracking */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                <Clock size={12} />
                Time Tracking (hours)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Estimated</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={form.estimated_hours}
                    onChange={e => set('estimated_hours', e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Actual</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={form.actual_hours}
                    onChange={e => set('actual_hours', e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                <Tag size={12} />
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
                placeholder="e.g. inspection, permit, RFI"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
              {form.tags.trim() && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="inline-flex items-center px-2 py-0.5 bg-navy-50 text-navy-700 text-[11px] font-medium rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
