'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Circle, Clock, AlertCircle, Flag, ClipboardList, Loader2, RefreshCw,
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Task, TaskPriority } from '@/types'

type TaskWithJob = Task & {
  job: { id: string; name: string; status: string } | null
}

type Filter = 'mine' | 'all'

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low:    'bg-gray-300',
  medium: 'bg-blue-400',
  high:   'bg-amber-400',
  urgent: 'bg-red-500',
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function fmtDue(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Group {
  key: string
  title: string
  accent: string
  tasks: TaskWithJob[]
}

function groupTasks(tasks: TaskWithJob[]): Group[] {
  const today = todayStr()
  const overdue:  TaskWithJob[] = []
  const dueToday: TaskWithJob[] = []
  const upcoming: TaskWithJob[] = []
  const noDate:   TaskWithJob[] = []

  for (const t of tasks) {
    if (!t.due_date) noDate.push(t)
    else if (t.due_date < today) overdue.push(t)
    else if (t.due_date === today) dueToday.push(t)
    else upcoming.push(t)
  }

  return [
    { key: 'overdue',  title: 'Overdue',     accent: 'text-red-600',   tasks: overdue  },
    { key: 'today',    title: 'Today',       accent: 'text-gold-600',  tasks: dueToday },
    { key: 'upcoming', title: 'Upcoming',    accent: 'text-navy-600',  tasks: upcoming },
    { key: 'nodate',   title: 'No due date', accent: 'text-gray-500',  tasks: noDate   },
  ].filter(g => g.tasks.length > 0)
}

export function MyTasksClient() {
  const { can, isAdmin } = usePermissions()
  const { user } = useCurrentUser()
  const canEdit = isAdmin() || can('tasks', 'edit')

  const [tasks, setTasks] = useState<TaskWithJob[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const filterTouchedRef = useRef(false)
  // Tasks just marked done — kept visible briefly with a strikethrough
  const [justDone, setJustDone] = useState<Set<string>>(new Set())

  // Pull-to-refresh
  const [pullPx, setPullPx] = useState(0)
  const touchStartY = useRef<number | null>(null)

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks?scope=open')
      if (!res.ok) throw new Error('Failed to load tasks')
      setTasks(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Default to "Mine" once we know the user has assigned tasks (unless they've toggled)
  useEffect(() => {
    if (filterTouchedRef.current || !user) return
    if (tasks.some(t => t.assigned_to === user.id)) setFilter('mine')
  }, [tasks, user])

  const myCount = user ? tasks.filter(t => t.assigned_to === user.id).length : 0
  const visible = filter === 'mine' && user
    ? tasks.filter(t => t.assigned_to === user.id)
    : tasks

  // ── Optimistic actions ──────────────────────────────────────────────────────
  async function patchTask(id: string, updates: Partial<Task>): Promise<boolean> {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function markDone(task: TaskWithJob) {
    if (!canEdit) return
    setJustDone(prev => new Set(prev).add(task.id))
    const ok = await patchTask(task.id, { status: 'done' })
    if (ok) {
      // Drop from the list after the strikethrough has been visible
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== task.id))
        setJustDone(prev => { const n = new Set(prev); n.delete(task.id); return n })
      }, 700)
    } else {
      setJustDone(prev => { const n = new Set(prev); n.delete(task.id); return n })
      setError('Couldn’t complete the task — check your connection and try again')
    }
  }

  async function toggleBlocked(task: TaskWithJob) {
    if (!canEdit) return
    const nextStatus = task.status === 'blocked' ? 'todo' : 'blocked'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t))
    const ok = await patchTask(task.id, { status: nextStatus })
    if (!ok) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t))
      setError('Couldn’t update the task — check your connection and try again')
    }
  }

  // ── Pull-to-refresh handlers ────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 0) touchStartY.current = e.touches[0].clientY
    else touchStartY.current = null
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null || refreshing) return
    const delta = e.touches[0].clientY - touchStartY.current
    setPullPx(delta > 0 ? Math.min(delta * 0.4, 70) : 0)
  }
  function onTouchEnd() {
    if (pullPx >= 55 && !refreshing) load(true)
    setPullPx(0)
    touchStartY.current = null
  }

  const groups = groupTasks(visible)
  const today = todayStr()

  return (
    <div
      className="max-w-lg mx-auto pb-24"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex justify-center overflow-hidden transition-[height]"
        style={{ height: refreshing ? 36 : pullPx > 0 ? Math.round(pullPx / 2) + 12 : 0 }}
      >
        <RefreshCw
          size={18}
          className={`text-navy-400 mt-2 ${refreshing ? 'animate-spin' : ''}`}
          style={!refreshing ? { transform: `rotate(${pullPx * 3}deg)` } : undefined}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h1 className="font-display text-2xl font-bold text-navy-900">My Tasks</h1>
        <div className="flex gap-1.5">
          <button
            onClick={() => { filterTouchedRef.current = true; setFilter('mine') }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'mine' ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Mine{myCount > 0 ? ` (${myCount})` : ''}
          </button>
          <button
            onClick={() => { filterTouchedRef.current = true; setFilter('all') }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'all' ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            All ({tasks.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white animate-pulse border border-border" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <ClipboardList size={40} className="text-gray-200" />
          <p className="text-sm font-medium">
            {filter === 'mine' ? 'Nothing assigned to you — nice.' : 'No open tasks. All clear.'}
          </p>
          {filter === 'mine' && tasks.length > 0 && (
            <button
              onClick={() => { filterTouchedRef.current = true; setFilter('all') }}
              className="text-sm font-semibold text-gold-600"
            >
              Show all {tasks.length} open tasks →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <section key={group.key}>
              <h2 className={`text-[11px] font-bold uppercase tracking-widest mb-2 px-1 ${group.accent}`}>
                {group.title}
                <span className="ml-1.5 font-sans font-semibold text-gray-400 normal-case tracking-normal">
                  {group.tasks.length}
                </span>
              </h2>
              <div className="bg-white rounded-xl border border-border divide-y divide-gray-100 overflow-hidden">
                {group.tasks.map(task => {
                  const done = justDone.has(task.id)
                  const overdue = !!task.due_date && task.due_date < today
                  return (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3.5">
                      {/* Complete toggle */}
                      <button
                        onClick={() => !done && markDone(task)}
                        disabled={!canEdit}
                        className={`mt-0.5 shrink-0 transition-colors ${
                          done ? 'text-green-500' : canEdit ? 'text-gray-300 active:text-green-500' : 'text-gray-200'
                        }`}
                        aria-label="Mark done"
                      >
                        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                      </button>

                      {/* Content — links to the job's task list for details */}
                      <Link href={`/jobs/${task.job_id}/tasks`} className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-navy-800'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] text-gray-400 truncate max-w-[45%]">
                            {task.job?.name ?? ''}
                          </span>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                          {task.due_date && (
                            <span className={`flex items-center gap-1 text-[11px] ${overdue && !done ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                              {overdue && !done ? <AlertCircle size={10} /> : <Clock size={10} className="text-gray-300" />}
                              {fmtDue(task.due_date)}
                            </span>
                          )}
                          {task.status === 'blocked' && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-600 rounded px-1.5 py-0.5">
                              Blocked
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* Blocked / need help */}
                      {canEdit && !done && (
                        <button
                          onClick={() => toggleBlocked(task)}
                          className={`mt-0.5 shrink-0 p-1 transition-colors ${
                            task.status === 'blocked' ? 'text-red-500' : 'text-gray-300 active:text-red-500'
                          }`}
                          aria-label={task.status === 'blocked' ? 'Unblock task' : 'Flag as blocked — need help'}
                          title={task.status === 'blocked' ? 'Unblock' : 'Blocked / need help'}
                        >
                          <Flag size={16} fill={task.status === 'blocked' ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {refreshing && (
            <p className="flex items-center justify-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 size={12} className="animate-spin" /> Refreshing…
            </p>
          )}
        </div>
      )}
    </div>
  )
}
