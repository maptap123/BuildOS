'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Filter } from 'lucide-react'
import Link from 'next/link'
import type { TimeEntry } from '@/types'

interface EntryUser {
  id: string
  full_name: string | null
  avatar_url: string | null
  hourly_rate: number | null
}

interface EntryJob {
  id: string
  name: string
  job_number: string
}

interface EntryRow extends TimeEntry {
  user?: EntryUser | null
  job?: EntryJob | null
}

interface SimpleUser {
  id: string
  full_name: string | null
  email: string
}

interface SimpleJob {
  id: string
  name: string
  job_number: string
}

interface Props {
  initialEntries: EntryRow[]
  users: SimpleUser[]
  jobs: SimpleJob[]
}

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

export function ShiftsClient({ initialEntries, users, jobs }: Props) {
  const [entries, setEntries] = useState<EntryRow[]>(initialEntries)
  const [filterStatus, setFilterStatus] = useState<ApprovalFilter>('all')
  const [filterUser, setFilterUser] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterStatus !== 'all' && e.approval_status !== filterStatus) return false
      if (filterUser && e.user_id !== filterUser) return false
      if (filterJob && e.job_id !== filterJob) return false
      return true
    })
  }, [entries, filterStatus, filterUser, filterJob])

  const pendingCount = entries.filter(e => e.approval_status === 'pending').length

  async function approve(id: string) {
    await updateApproval(id, 'approved')
  }

  async function reject(id: string) {
    await updateApproval(id, 'rejected')
  }

  async function updateApproval(id: string, status: 'approved' | 'rejected') {
    setLoadingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/time-entries/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, approval_status: status } : e
      ))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoadingId(null)
    }
  }

  const totalHours = filtered.reduce((sum, e) => sum + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0)
  const totalLaborCost = filtered.reduce((sum, e) => sum + (e.labor_cost ?? 0), 0)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/time-clock" className="text-gray-400 hover:text-navy-900 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold text-navy-900">Shift Management</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} shifts &middot; {totalHours.toFixed(1)}h &middot; ${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} labor
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
          <Filter size={12} />
          Filters
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as ApprovalFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                filterStatus === s
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:border-navy-400"
          >
            <option value="">All team members</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
            ))}
          </select>
          <select
            value={filterJob}
            onChange={e => setFilterJob(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:border-navy-400"
          >
            <option value="">All jobs</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Shift rows */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No shifts match these filters.</div>
        )}
        {filtered.map(entry => {
          const hrs = (entry.regular_hours ?? 0) + (entry.overtime_hours ?? 0)
          const isOpen = !entry.clock_out
          const isLoading = loadingId === entry.id

          return (
            <div
              key={entry.id}
              className={`bg-white border rounded-xl px-4 py-3 ${
                isOpen ? 'border-green-300' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-navy-900 text-sm">
                      {entry.user?.full_name ?? 'Unknown'}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${
                        STATUS_STYLES[entry.approval_status] ?? ''
                      }`}
                    >
                      {isOpen ? 'active' : entry.approval_status}
                    </span>
                    {entry.qb_synced && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                        QB Synced
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {entry.job?.name ?? '—'} &middot; {formatDate(entry.clock_in)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatTime(entry.clock_in)}
                    {entry.clock_out ? ` – ${formatTime(entry.clock_out)}` : ' → still clocked in'}
                    {entry.cost_code && <span className="ml-2 text-navy-500">{entry.cost_code}</span>}
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{entry.notes}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-navy-900">{hrs.toFixed(2)}h</p>
                  {entry.labor_cost != null && (
                    <p className="text-xs text-gray-400">${entry.labor_cost.toFixed(2)}</p>
                  )}
                  {entry.overtime_hours > 0 && (
                    <p className="text-[10px] text-amber-600 mt-0.5">{entry.overtime_hours.toFixed(2)}h OT</p>
                  )}
                </div>
              </div>

              {/* Approve/Reject actions — only for completed pending shifts */}
              {!isOpen && entry.approval_status === 'pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => approve(entry.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={13} />
                    Approve
                  </button>
                  <button
                    onClick={() => reject(entry.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <XCircle size={13} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
