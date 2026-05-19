'use client'

import { CheckCircle2, Circle, Clock, Pencil, Trash2, AlertCircle, ClipboardList } from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types'

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low:    'bg-gray-300',
  medium: 'bg-blue-400',
  high:   'bg-amber-400',
  urgent: 'bg-red-500',
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo:        'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked:     'bg-red-50 text-red-600',
  done:        'bg-green-50 text-green-700',
  archived:    'bg-gray-50 text-gray-400',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  done:        'Done',
  archived:    'Archived',
}

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  tasks: Task[]
  permissions: Permissions
  isPunchView?: boolean
  onAdd: () => void
  onEdit: (task: Task) => void
  onMarkDone: (id: string) => void
  onDelete: (id: string) => void
}

function formatDue(dateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdue = due < today
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label, overdue }
}

function PriorityDot({ priority }: { priority: TaskPriority }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`} />
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TaskList({ tasks, permissions, isPunchView, onAdd, onEdit, onMarkDone, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isPunchView ? 'Punch List' : 'Tasks'}
          </h2>
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              + Add Task
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <ClipboardList size={32} className="text-gray-200" />
          {isPunchView
            ? "No punch list items. Add a task and tag it 'punch'."
            : 'No tasks yet'}
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              {isPunchView ? 'Add punch list item →' : 'Add the first task →'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-display font-semibold text-navy-900 text-base">
          {isPunchView ? 'Punch List' : 'Tasks'}
          <span className="ml-2 text-xs font-sans font-normal text-gray-400">{tasks.length} item{tasks.length !== 1 ? 's' : ''}</span>
        </h2>
        {permissions.can_create && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            + Add Task
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left px-5 py-3 w-8"></th>
              <th className="text-left px-3 py-3">Task</th>
              <th className="text-left px-3 py-3 w-28">Priority</th>
              <th className="text-left px-3 py-3 w-32">Status</th>
              <th className="text-left px-3 py-3 w-28">Due</th>
              <th className="text-right px-5 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => {
              const due = task.due_date ? formatDue(task.due_date) : null
              const isDone = task.status === 'done'

              return (
                <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    {permissions.can_edit && !isDone ? (
                      <button
                        onClick={() => onMarkDone(task.id)}
                        className="text-gray-300 hover:text-green-500 transition-colors"
                        title="Mark done"
                      >
                        <Circle size={18} />
                      </button>
                    ) : isDone ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                      <Circle size={18} className="text-gray-200" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium text-navy-800 leading-snug ${isDone ? 'line-through text-gray-400' : ''}`}>
                        {task.title}
                      </p>
                      {task.tags?.includes('punch') && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 shrink-0">
                          Punch
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{task.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <PriorityDot priority={task.priority} />
                      <span className="text-xs text-gray-500">{PRIORITY_LABEL[task.priority]}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-3 py-3">
                    {due ? (
                      <div className={`flex items-center gap-1 text-xs ${due.overdue && !isDone ? 'text-red-600' : 'text-gray-500'}`}>
                        {due.overdue && !isDone && <AlertCircle size={11} className="shrink-0" />}
                        {!due.overdue && <Clock size={11} className="shrink-0 text-gray-300" />}
                        {due.label}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {permissions.can_edit && (
                        <button
                          onClick={() => onEdit(task)}
                          className="text-gray-300 hover:text-navy-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {permissions.can_delete && (
                        <button
                          onClick={() => onDelete(task.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-100">
        {tasks.map(task => {
          const due = task.due_date ? formatDue(task.due_date) : null
          const isDone = task.status === 'done'

          return (
            <div key={task.id} className="px-4 py-4">
              <div className="flex items-start gap-3">
                {/* Done toggle */}
                {permissions.can_edit ? (
                  <button
                    onClick={() => !isDone && onMarkDone(task.id)}
                    className={`mt-0.5 shrink-0 transition-colors ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}
                  >
                    {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                ) : (
                  <span className="mt-0.5 shrink-0">
                    {isDone ? <CheckCircle2 size={20} className="text-green-500" /> : <Circle size={20} className="text-gray-200" />}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-gray-400' : 'text-navy-800'}`}>
                        {task.title}
                      </p>
                      {task.tags?.includes('punch') && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 shrink-0">
                          Punch
                        </span>
                      )}
                    </div>
                    <StatusBadge status={task.status} />
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-400 mb-1.5 line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      <PriorityDot priority={task.priority} />
                      <span className="text-[11px] text-gray-400">{PRIORITY_LABEL[task.priority]}</span>
                    </div>
                    {due && (
                      <div className={`flex items-center gap-1 text-[11px] ${due.overdue && !isDone ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {due.overdue && !isDone ? <AlertCircle size={11} /> : <Clock size={11} className="text-gray-300" />}
                        {due.label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {(permissions.can_edit || permissions.can_delete) && (
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {permissions.can_edit && (
                      <button
                        onClick={() => onEdit(task)}
                        className="text-gray-300 hover:text-navy-600 transition-colors p-1"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {permissions.can_delete && (
                      <button
                        onClick={() => onDelete(task.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
