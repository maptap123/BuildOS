'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle, XCircle, Filter, MapPin, Clock, AlertCircle,
  Download, Users, CheckSquare, Square, Timer, X,
} from 'lucide-react'
import Link from 'next/link'
import type { TimeEntry } from '@/types'
import type { ShiftRange } from '@/app/(dashboard)/time-clock/shifts/page'

// --- Local types --------------------------------------------------------------

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
  currentRange: ShiftRange
}

type ApprovalFilter = 'all' | 'open' | 'pending' | 'approved' | 'rejected'

const RANGE_LABELS: Record<ShiftRange, string> = {
  today: 'Today',
  '7d':  '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
  '1y':  '1 Year',
  all:   'All Time',
}

const ALL_RANGES = Object.keys(RANGE_LABELS) as ShiftRange[]

// --- Helpers ------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

// --- Component ----------------------------------------------------------------

type ManagerView = 'shifts' | 'employees'

export function ShiftsClient({ initialEntries, users, jobs, currentRange }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState<EntryRow[]>(initialEntries)
  const [filterStatus, setFilterStatus] = useState<ApprovalFilter>('all')
  const [filterUser, setFilterUser] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ManagerView>('shifts')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // -- Global stats (all loaded entries) ---------------------------------------
  const stats = useMemo(() => ({
    open:     entries.filter((e) => !e.clock_out).length,
    pending:  entries.filter((e) => e.clock_out && e.approval_status === 'pending').length,
    approved: entries.filter((e) => e.approval_status === 'approved').length,
    rejected: entries.filter((e) => e.approval_status === 'rejected').length,
  }), [entries])

  // -- Filtered entries --------------------------------------------------------
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterStatus === 'open') return !e.clock_out
      if (filterStatus !== 'all' && e.approval_status !== filterStatus) return false
      if (filterUser && e.user_id !== filterUser) return false
      if (filterJob && e.job_id !== filterJob) return false
      return true
    })
  }, [entries, filterStatus, filterUser, filterJob])

  // -- Summary for filtered set ------------------------------------------------
  const summary = useMemo(() => ({
    totalHours:    filtered.reduce((s, e) => s + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0),
    overtimeHours: filtered.reduce((s, e) => s + (e.overtime_hours ?? 0), 0),
    laborCost:     filtered.reduce((s, e) => s + (e.labor_cost ?? 0), 0),
  }), [filtered])

  // -- Clocked in right now (independent of date/status filters) ---------------
  const clockedInNow = useMemo(
    () => entries.filter((e) => !e.clock_out).sort((a, b) => a.clock_in.localeCompare(b.clock_in)),
    [entries],
  )

  // -- Per-employee weekly rollup (respects current filters/date range) --------
  const employeeRollup = useMemo(() => {
    const byUser = new Map<string, {
      userId: string
      name: string
      shiftCount: number
      regularHours: number
      overtimeHours: number
      laborCost: number
      openNow: boolean
    }>()

    for (const e of filtered) {
      const key = e.user_id
      const row = byUser.get(key) ?? {
        userId: key,
        name: e.user?.full_name ?? 'Unknown',
        shiftCount: 0,
        regularHours: 0,
        overtimeHours: 0,
        laborCost: 0,
        openNow: false,
      }
      row.shiftCount += 1
      row.regularHours += e.regular_hours ?? 0
      row.overtimeHours += e.overtime_hours ?? 0
      row.laborCost += e.labor_cost ?? 0
      if (!e.clock_out) row.openNow = true
      byUser.set(key, row)
    }

    return Array.from(byUser.values()).sort((a, b) => b.regularHours + b.overtimeHours - (a.regularHours + a.overtimeHours))
  }, [filtered])

  // -- Bulk selection: only completed, pending entries are selectable ----------
  const selectablePendingIds = useMemo(
    () => filtered.filter((e) => e.clock_out && e.approval_status === 'pending').map((e) => e.id),
    [filtered],
  )

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllPending() {
    setSelectedIds((prev) =>
      prev.size === selectablePendingIds.length ? new Set() : new Set(selectablePendingIds),
    )
  }

  async function bulkApprove(status: 'approved' | 'rejected') {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/time-entries/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Bulk update failed')
      setEntries((prev) =>
        prev.map((e) => (selectedIds.has(e.id) ? { ...e, approval_status: status } : e)),
      )
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkLoading(false)
    }
  }

  // -- CSV export for payroll (current filtered set) ---------------------------
  function exportCSV() {
    const header = [
      'Employee', 'Job', 'Date', 'Clock In', 'Clock Out',
      'Regular Hours', 'Overtime Hours', 'Cost Code', 'Labor Cost', 'Status',
    ]
    const rows = filtered.map((e) => [
      e.user?.full_name ?? 'Unknown',
      e.job?.name ?? '',
      formatDate(e.clock_in),
      formatTime(e.clock_in),
      e.clock_out ? formatTime(e.clock_out) : '',
      (e.regular_hours ?? 0).toFixed(2),
      (e.overtime_hours ?? 0).toFixed(2),
      e.cost_code ?? '',
      (e.labor_cost ?? 0).toFixed(2),
      e.clock_out ? e.approval_status : 'active',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `buildos-timeclock-${currentRange}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // -- Approve / Reject --------------------------------------------------------
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

  // -- Render ------------------------------------------------------------------
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
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

        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-white border border-gray-200 hover:border-navy-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 shrink-0"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Clocked in now */}
      {clockedInNow.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-2.5">
            <Timer size={13} />
            Clocked in now &middot; {clockedInNow.length}
          </div>
          <div className="flex flex-wrap gap-2">
            {clockedInNow.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 bg-white border border-green-200 rounded-lg pl-2.5 pr-3 py-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-navy-900 leading-tight">{e.user?.full_name ?? 'Unknown'}</p>
                  <p className="text-[10px] text-gray-500 leading-tight truncate max-w-[160px]">
                    {e.job?.name ?? '—'} &middot; since {formatTime(e.clock_in)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setView('shifts')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'shifts'
              ? 'bg-navy-900 text-white border-navy-900'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          <Clock size={12} />
          Shifts
        </button>
        <button
          onClick={() => setView('employees')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'employees'
              ? 'bg-navy-900 text-white border-navy-900'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          <Users size={12} />
          By Employee
        </button>
      </div>

      {/* Stats row */}
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

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
            <Filter size={11} />
            Filters
          </div>
          {view === 'shifts' && selectablePendingIds.length > 0 && (
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()) }}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                selectMode
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {selectMode ? <X size={12} /> : <CheckSquare size={12} />}
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>

        {/* Date range — drives server re-fetch via URL param */}
        <div className="flex flex-wrap gap-2">
          {ALL_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => router.push(`/time-clock/shifts?range=${r}`)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                currentRange === r
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {RANGE_LABELS[r]}
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

      {/* Employee weekly rollup */}
      {view === 'employees' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {employeeRollup.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No shifts match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5 text-right">Shifts</th>
                    <th className="px-4 py-2.5 text-right">Regular</th>
                    <th className="px-4 py-2.5 text-right">OT</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Labor Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRollup.map((row) => (
                    <tr key={row.userId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-navy-900">
                        <div className="flex items-center gap-2">
                          {row.openNow && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Clocked in now" />}
                          {row.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.shiftCount}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{row.regularHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right">
                        {row.overtimeHours > 0
                          ? <span className="text-amber-600 font-medium">{row.overtimeHours.toFixed(1)}h</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-900">
                        {(row.regularHours + row.overtimeHours).toFixed(1)}h
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {row.laborCost > 0 ? `$${row.laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-navy-900">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{filtered.length}</td>
                    <td className="px-4 py-3 text-right">{employeeRollup.reduce((s, r) => s + r.regularHours, 0).toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-amber-700">{employeeRollup.reduce((s, r) => s + r.overtimeHours, 0).toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right">{summary.totalHours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right">${summary.laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Shift cards */}
      {view === 'shifts' && (
      <div className="space-y-2 pb-16">
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
          const isSelectable = entry.clock_out && entry.approval_status === 'pending'
          const isSelected = selectedIds.has(entry.id)

          return (
            <div
              key={entry.id}
              onClick={() => selectMode && isSelectable && toggleSelected(entry.id)}
              className={`bg-white border rounded-xl px-4 py-3.5 ${
                isOpen ? 'border-green-300 bg-green-50/30' : 'border-border'
              } ${selectMode && isSelectable ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-navy-400' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                {selectMode && (
                  <div className="shrink-0 pt-0.5">
                    {isSelectable ? (
                      isSelected
                        ? <CheckSquare size={18} className="text-navy-700" />
                        : <Square size={18} className="text-gray-300" />
                    ) : (
                      <Square size={18} className="text-gray-100" />
                    )}
                  </div>
                )}
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
                    {entry.job?.name ?? '—'} &middot; {formatDate(entry.clock_in)}
                  </p>

                  {/* Times */}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatTime(entry.clock_in)}
                    {entry.clock_out
                      ? ` — ${formatTime(entry.clock_out)}`
                      : <span className="text-green-600 font-medium"> → clocked in now</span>}
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

              {/* Approve / Reject — only for completed pending entries, hidden in bulk-select mode */}
              {!isOpen && !selectMode && entry.approval_status === 'pending' && (
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
      )}

      {/* Sticky bulk action bar */}
      {selectMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-navy-900 text-white rounded-xl shadow-lg px-4 py-3">
          <button
            onClick={toggleSelectAllPending}
            className="text-xs font-semibold text-white/80 hover:text-white underline underline-offset-2"
          >
            {selectedIds.size === selectablePendingIds.length ? 'Deselect all' : `Select all (${selectablePendingIds.length})`}
          </button>
          <span className="text-xs text-white/60">{selectedIds.size} selected</span>
          <button
            onClick={() => bulkApprove('approved')}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="flex items-center gap-1.5 text-xs font-semibold bg-green-500 hover:bg-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <CheckCircle size={13} />
            Approve
          </button>
          <button
            onClick={() => bulkApprove('rejected')}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="flex items-center gap-1.5 text-xs font-semibold bg-red-500 hover:bg-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <XCircle size={13} />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
