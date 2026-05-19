'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { TaskList } from './TaskList'
import { AddTaskModal } from './AddTaskModal'
import type { Task, TaskStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  currentUserId?: string
  initialTasks: Task[]
  permissions: Permissions
}

type FilterTab = 'all' | TaskStatus

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'todo',       label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked',    label: 'Blocked' },
  { key: 'done',       label: 'Done' },
]

export function TaskClient({ jobId, currentUserId, initialTasks, permissions }: Props) {
  const { tasks, loading, error, refresh } = useTasks(jobId, initialTasks)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)

  const activeTasks = tasks.filter(t => t.status !== 'archived')

  const filteredTasks = filter === 'all'
    ? activeTasks
    : activeTasks.filter(t => t.status === filter)

  function countFor(tab: FilterTab) {
    if (tab === 'all') return activeTasks.length
    return activeTasks.filter(t => t.status === tab).length
  }

  async function handleMarkDone(id: string) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      })
      if (!res.ok) throw new Error('Failed to update task')
      refresh()
    } catch {
      // silently swallow — user can retry via edit modal
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      refresh()
    } catch {
      // silently swallow
    }
  }

  return (
    <div className="space-y-4">

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-1 px-1">
        {TABS.map(tab => {
          const count = countFor(tab.key)
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-navy-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] font-semibold ${active ? 'text-white/70' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
          Loading tasks…
        </div>
      ) : (
        <TaskList
          tasks={filteredTasks}
          permissions={permissions}
          onAdd={() => setShowAdd(true)}
          onEdit={task => setEditTask(task)}
          onMarkDone={handleMarkDone}
          onDelete={handleDelete}
        />
      )}

      {showAdd && (
        <AddTaskModal
          jobId={jobId}
          currentUserId={currentUserId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh() }}
        />
      )}

      {editTask && (
        <AddTaskModal
          jobId={jobId}
          task={editTask}
          currentUserId={currentUserId}
          onClose={() => setEditTask(null)}
          onSaved={() => { setEditTask(null); refresh() }}
        />
      )}
    </div>
  )
}
