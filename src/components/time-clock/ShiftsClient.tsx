'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Filter, MapPin, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { TimeEntry } from '@/types'

// â”€â”€â”€ Local types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

type ApprovalFilter = 'all' | 'open' | 'pending' | 'approved' | 'rejected'
type DateRange = 'today' | '7d' | '30d'

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function getDateCutoff(range: DateRange): Date {
  if (range === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }
  if (range === '7d') {
    const d = new Date(); d.setDate(d.getDate() - 7); return d
  }
  // 30d
  const d = new Date(); d.setDate(d.getDate() - 30); return d
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ShiftsClient({ initialEntries, users, jobs }: Props) {
  const [entries, setEntries] = useState<EntryRow[]>(initialEntries)
  const [filterStatus, setFilterStatus] = useState<ApprovalFilter>('all')
  const [filterDateRange, setFilterDateRange] = useState<DateRange>('30d')
  const [filterUser, setFilterUser] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // â”€â”€ Global stats (all 30d entries) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stats = useMemo(() => ({
    open:     entries.filter((e) => !e.clock_out).length,
    pending:  entries.filter((e) => e.clock_out && e.approval_status === 'pending').length,
    approved: entries.filter((e) => e.approval_status === 'approved').length,
    rejected: entries.filter((e) => e.approval_status === 'rejected').length,
  }), [entries])

  // â”€â”€ Filtered entries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filtered = useMemo(() => {
    const cutoff = getDateCutoff(filterDateRange)
    return entries.filter((e) => {
      if (new Date(e.clock_in) < cutoff) return false
      if (filterStatus === 'open') return !e.clock_out
      if (filterStatus !== 'all' && e.approval_status !== filterStatus) return false
      if (filterUser && e.user_id !== filterUser) return false
      if (filterJob && e.job_id !== filterJob) return false
      return true
    })
  }, [entries, filterStatus, filterDateRange, filterUser, filterJob])

  // â”€â”€ Summary for filtered set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const summary = useMemo(() => ({
    totalHours:    filtered.reduce((s, e) => s + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0),
    overtimeHours: filtered.reduce((s, e) => s + (e.overtime_hours ?? 0), 0),
    laborCost:     filtered.reduce((s, e) => s + (e.labor_cost ?? 0), 0),
  }), [filtered])

  // â”€â”€ Approve / Reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, approval_status: status } : e)),
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoadingId(null)
    }
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-5">

      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-center gap-3">
        <Link href="/time-clock" className="text-gray-400 hover:text-navy-900 transition-colors p-1">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-bold text-navy-900">Shift Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} shifts &middot; {summary.totalHours.toFixed(1)}h
            {summary.overtimeHours > 0 && (
              <span className="text-amber-600"> ({summary.overtimeHours.toFixed(1)}h OT)</span>
            )}
            {summary.laborCost > 0 && (
              <span>
                {' '}&middot; ${summary.laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} labor
              </span>
            )}
          </p>
        </div>
      </div>

      {/* â”€â”€ Error banner â”€â”€ */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* â”€â”€ Stats row â”€â”€ */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Open',     value: stats.open,     color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
          { label: 'Pending',  value: stats.pending,  color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
          { label: 'Approved', value: stats.approved, color: 'text-navy-700',   bg: 'bg-navy-50',   border: 'border-navy-200' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
        ].map(({ label, value, color, bg, border }) => (
          <div
            key={label}
            className={`${bg} ${border} border rounded-xl px-3 py-2.5 text-center cursor-pointer transition-opacity ${
              filterStatus !== 'all' && filterStatus !== label.toLowerCase() ? 'opacity-40' : ''
            }`}
            onClick={() =>
              setFilterStatus(
                filterStatus === (label.toLowerCase() as ApprovalFilter)
                  ? 'all'
                  : (label.toLowerCase() as ApprovalFilter),
              )
            }
          >
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] font-semibold text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* â”€â”€ Filters â”€â”€ */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          <Filter size={11} />
          Filters
        </div>

        {/* Date range */}
        <div className="flex gap-2">
          {(['today', '7d', '30d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setFilterDateRange(r)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                filterDateRange === r
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'open', 'pending', 'approved', 'rejected'] as ApprovalFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                filterStatus === s
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* User + Job selects */}
        <div className="flex gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:border-navy-400 min-w-0"
          >
            <option value="">All team members</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.email}
              </option>
            ))}
          </select>
          <select
            value={filterJob}
            onChange={(e) => setFilterJob(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:border-navy-400 min-w-0"
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* â”€â”€ Shift cards â”€â”€ */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No shifts match these filters.
          </div>
        )}

        {filtered.map((entry) => {
          const hrs = (entry.regular_hours ?? 0) + (entry.overtime_hours ?? 0)
          const isOpen = !entry.clock_out
          const isLoading = loadingId === entry.id
          const hasOT = (entry.overtime_hours ?? 0) > 0
          const hasClockInLoc = entry.clock_in_latitude != null
          const hasClockOutLoc = entry.clock_out_latitude != null

          return (
            <div
              key={entry.id}
              className={`bg-white border rounded-xl px-4 py-3.5 ${
                isOpen ? 'border-green-300 bg-green-50/30' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">

                  {/* Name + status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-navy-900 text-sm">
                      {entry.user?.full_name ?? 'Unknown'}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                        isOpen
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : (STATUS_STYLES[entry.approval_status] ?? '')
                      }`}
                    >
                      {isOpen ? 'active' : entry.approval_status}
                    </span>
                    {hasOT && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                        OT
                      </span>
                    )}
                    {entry.qb_synced && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                        QB
                      </span>
                    )}
                  </div>

                  {/* Job + date */}
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.job?.name ?? 'â€”'} &middot; {formatDate(entry.clock_in)}
                  </p>

                  {/* Times */}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatTime(entry.clock_in)}
                    {entry.clock_out
                      ? ` â€“ ${formatTime(entry.clock_out)}`
                      : <span className="text-green-600 font-medium"> â†’ clocked in now</span>}
                    {entry.cost_code && (
                      <span className="ml-2 text-navy-500 font-medium">{entry.cost_code}</span>
                    )}
                    {entry.break_minutes > 0 && (
                      <span className="ml-2 text-gray-400">{entry.break_minutes}m break</span>
                    )}
                  </p>

                  {/* Notes */}
                  {entry.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic leading-relaxed">
                      &ldquo;{entry.notes}&rdquo;
                    </p>
                  )}

                  {/* Location indicators */}
                  {(hasClockInLoc || hasClockOutLoc || entry.location_status === 'denied') && (
                    <div className="flex items-center gap-3 mt-1.5">
                      {hasClockInLoc && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                          <MapPin size={9} /> In
                        </span>
                      )}
                      {hasClockOutLoc && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                          <MapPin size={9} /> Out
                        </span>
                      )}
                      {entry.location_status === 'denied' && !hasClockInLoc && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-500">
                          <Clock size={9} /> Location denied
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right side: hours + cost */}
                <div className="shrink-0 text-right">
                  <p className="text-base font-black text-navy-900">{hrs.toFixed(2)}h</p>
                  {hasOT && (
                    <p className="text-[10px] font-semibold text-amber-600 mt-0.5">
                      {(entry.overtime_hours ?? 0).toFixed(2)}h OT
                    </p>
                  )}
                  {entry.labor_cost != null && entry.labor_cost > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${entry.labor_cost.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              {/* Approve / Reject â€” only for completed pending entries */}
              {!isOpen && entry.approval_status === 'pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => updateApproval(entry.id, 'approved')}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={13} />
                    Approve
                  </button>
                  <button
                    onClick={() => updateApproval(entry.id, 'rejected')}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
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

