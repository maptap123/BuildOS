'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Calendar, List, BarChart2, CalendarDays, CalendarRange,
  Search, X, ChevronLeft, ChevronRight, SlidersHorizontal,
} from 'lucide-react'
import type { ScheduleItem, ScheduleItemStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleView = 'list' | 'gantt' | 'week' | 'month' | 'year'

interface Filters {
  search: string
  statuses: ScheduleItemStatus[]
  trades: string[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Tailwind classes for status badges / filter chips (not bars)
const STATUS_CFG: Record<ScheduleItemStatus, {
  bg: string; text: string; border: string; dot: string; label: string
}> = {
  not_started: { bg: 'bg-gray-100',  text: 'text-gray-600',  border: 'border-gray-300',  dot: 'bg-gray-400',   label: 'Not Started' },
  in_progress:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-300',  dot: 'bg-blue-500',   label: 'In Progress' },
  blocked:      { bg: 'bg-red-50',   text: 'text-red-600',   border: 'border-red-300',   dot: 'bg-red-500',    label: 'Blocked'     },
  completed:    { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', dot: 'bg-green-500',  label: 'Completed'   },
  delayed:      { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500',  label: 'Delayed'     },
}

// Hex fallbacks for bar colors when item.color is null
const STATUS_HEX: Record<ScheduleItemStatus, string> = {
  not_started: '#9CA3AF',
  in_progress:  '#3B82F6',
  blocked:      '#EF4444',
  completed:    '#22C55E',
  delayed:      '#F59E0B',
}

const ALL_STATUSES: ScheduleItemStatus[] = [
  'not_started', 'in_progress', 'blocked', 'completed', 'delayed',
]

const VIEWS: { id: ScheduleView; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'list',  label: 'List',    short: 'List',  icon: List          },
  { id: 'gantt', label: 'Gantt',   short: 'Gantt', icon: BarChart2     },
  { id: 'week',  label: 'Weekly',  short: 'Week',  icon: CalendarDays  },
  { id: 'month', label: 'Monthly', short: 'Month', icon: Calendar      },
  { id: 'year',  label: 'Yearly',  short: 'Year',  icon: CalendarRange },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDay(s: string) {
  return new Date(s + 'T00:00:00')
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtRange(start: string, end: string) {
  const s = parseDay(start)
  const e = parseDay(end)
  const days = Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1
  return `${fmtShort(s)} – ${fmtShort(e)} · ${days}d`
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function itemBarColor(item: ScheduleItem): string {
  return item.color ?? STATUS_HEX[item.status]
}

function StatusBadge({ status }: { status: ScheduleItemStatus }) {
  const c = STATUS_CFG[status]
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded uppercase whitespace-nowrap ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{pct}%</span>
    </div>
  )
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────

function ListView({ items, onEdit }: { items: ScheduleItem[]; onEdit: (i: ScheduleItem) => void }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['#', 'Phase / Task', 'Trade', 'Start', 'End', 'Dur', 'Status', 'Progress'].map(h => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap first:w-10"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item, idx) => {
              const s = parseDay(item.start_date)
              const e = parseDay(item.end_date)
              const dur = Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1
              const color = itemBarColor(item)
              return (
                <tr
                  key={item.id}
                  onClick={() => onEdit(item)}
                  className="hover:bg-navy-50/30 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-navy-800 group-hover:text-navy-900">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{item.trade ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtShort(s)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtShort(e)}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{dur}d</td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 w-36">
                    <ProgressBar pct={item.percent_complete} color={color} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {items.map((item, idx) => {
          const color = itemBarColor(item)
          return (
            <button
              key={item.id}
              onClick={() => onEdit(item)}
              className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="min-w-0 flex items-start gap-2.5">
                  <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
                    <span className="text-[10px] text-gray-400 tabular-nums">{idx + 1}</span>
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800 leading-snug">{item.title}</p>
                    {item.trade && <p className="text-[11px] text-gray-400">{item.trade}</p>}
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-xs text-gray-400 mb-2">{fmtRange(item.start_date, item.end_date)}</p>
              {item.percent_complete > 0 && (
                <ProgressBar pct={item.percent_complete} color={color} />
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─── GANTT VIEW ───────────────────────────────────────────────────────────────

const PX_PER_DAY = 16  // fixed pixel width per day — bars always legible regardless of total span

function GanttView({ items, onEdit }: { items: ScheduleItem[]; onEdit: (i: ScheduleItem) => void }) {
  const { minDate, months, totalDays } = useMemo(() => {
    if (!items.length) return { minDate: new Date(), months: [] as { label: string; left: number }[], totalDays: 30 }

    const starts = items.map(i => parseDay(i.start_date))
    const ends = items.map(i => parseDay(i.end_date))
    let min = new Date(Math.min(...starts.map(d => d.getTime())))
    let max = new Date(Math.max(...ends.map(d => d.getTime())))
    min = new Date(min.getTime() - 7 * 86_400_000)
    max = new Date(max.getTime() + 7 * 86_400_000)
    const totalDays = Math.ceil((max.getTime() - min.getTime()) / 86_400_000)

    const months: { label: string; left: number }[] = []
    const cur = new Date(min.getFullYear(), min.getMonth(), 1)
    while (cur <= max) {
      months.push({
        label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        left: Math.max(0, daysBetween(min, cur)) * PX_PER_DAY,
      })
      cur.setMonth(cur.getMonth() + 1)
    }
    return { minDate: min, months, totalDays }
  }, [items])

  const today = new Date()
  const todayLeft = totalDays > 0 ? daysBetween(minDate, today) * PX_PER_DAY : null
  const showToday = todayLeft !== null && todayLeft >= 0 && todayLeft <= totalDays * PX_PER_DAY

  function barStyle(item: ScheduleItem): React.CSSProperties {
    const s = parseDay(item.start_date)
    const e = parseDay(item.end_date)
    const left = Math.max(0, daysBetween(minDate, s)) * PX_PER_DAY
    const width = Math.max(PX_PER_DAY, (daysBetween(s, e) + 1) * PX_PER_DAY)
    return { left, width }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex">

        {/* Label column */}
        <div className="w-56 shrink-0 border-r border-gray-100">
          <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center px-4">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Phase</span>
          </div>
          {items.map(item => {
            const color = itemBarColor(item)
            return (
              <div
                key={item.id}
                onClick={() => onEdit(item)}
                className="flex items-center gap-2.5 px-4 h-11 border-b border-gray-50 hover:bg-gray-50 cursor-pointer group"
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy-800 font-medium truncate group-hover:text-navy-900">{item.title}</p>
                  {item.trade && <p className="text-[10px] text-gray-400 truncate">{item.trade}</p>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bar chart — fixed pixel width so bars stay legible at any timeline span */}
        <div className="relative shrink-0" style={{ width: totalDays * PX_PER_DAY }}>
          {/* Month ruler */}
          <div className="relative h-8 bg-gray-50 border-b border-gray-100 overflow-hidden">
            {months.map(m => (
              <div
                key={m.label}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: m.left }}
              >
                <div className="w-px h-full bg-gray-200" />
                <span className="text-[10px] text-gray-400 pl-1.5 whitespace-nowrap">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Today line */}
          {showToday && (
            <div
              className="absolute top-0 bottom-0 w-px bg-gold-500 z-10 pointer-events-none"
              style={{ left: todayLeft ?? 0 }}
            />
          )}

          {/* Bars */}
          {items.map(item => {
            const color = itemBarColor(item)
            return (
              <div key={item.id} className="relative h-11 border-b border-gray-50 flex items-center">
                <div
                  onClick={() => onEdit(item)}
                  title={`${item.title} · ${fmtRange(item.start_date, item.end_date)}`}
                  className="absolute h-6 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden text-white"
                  style={{ ...barStyle(item), backgroundColor: color }}
                >
                  {item.percent_complete > 0 && item.percent_complete < 100 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-black/20"
                      style={{ width: `${item.percent_complete}%` }}
                    />
                  )}
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold pointer-events-none whitespace-nowrap overflow-hidden">
                    {item.title}
                    {item.percent_complete > 0 && ` · ${item.percent_complete}%`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────

function WeekView({ items, onEdit }: { items: ScheduleItem[]; onEdit: (i: ScheduleItem) => void }) {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  })

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const weekEnd = days[6]
  const today = new Date()

  const weekItems = useMemo(() => {
    const ws = weekStart.getTime()
    const we = weekEnd.getTime() + 86_400_000
    return items.filter(item => {
      const s = parseDay(item.start_date).getTime()
      const e = parseDay(item.end_date).getTime() + 86_400_000
      return s < we && e > ws
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, weekStart.getTime()])

  function itemsForDay(day: Date) {
    const d = day.getTime()
    return items.filter(item => {
      const s = parseDay(item.start_date).getTime()
      const e = parseDay(item.end_date).getTime() + 86_400_000
      return s <= d && e > d
    })
  }

  function prevWeek() { setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d }) }
  function nextWeek() { setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d }) }
  function goToday()  {
    const n = new Date()
    setWeekStart(new Date(n.getFullYear(), n.getMonth(), n.getDate() - n.getDay()))
  }

  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 gap-2">
        <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={16} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-800">
            {fmtShort(weekStart)} – {fmtShort(weekEnd)}
          </span>
          <button
            onClick={goToday}
            className="text-[11px] font-semibold text-gold-600 hover:text-gold-700 border border-gold-300 px-2 py-0.5 rounded-md transition-colors"
          >
            Today
          </button>
        </div>
        <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Desktop 7-column grid */}
      <div className="hidden md:block overflow-x-auto">
      <div className="grid grid-cols-7 gap-2" style={{ minWidth: 700 }}>
        {days.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString()
          const dayItems = itemsForDay(day)
          return (
            <div
              key={i}
              className={`min-h-[130px] rounded-xl border p-2 ${
                isToday ? 'border-gold-400 bg-gold-50/40 ring-1 ring-gold-300' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="mb-2.5">
                <div className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-gold-600' : 'text-gray-400'}`}>
                  {DAY_SHORT[i]}
                </div>
                <div className={`text-xl font-bold leading-none mt-0.5 ${isToday ? 'text-gold-600' : 'text-navy-800'}`}>
                  {day.getDate()}
                </div>
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 4).map(item => (
                  <button
                    key={item.id}
                    onClick={() => onEdit(item)}
                    className="w-full text-left text-[10px] font-semibold px-1.5 py-1 rounded truncate text-white"
                    style={{ backgroundColor: itemBarColor(item) }}
                  >
                    {item.title}
                  </button>
                ))}
                {dayItems.length > 4 && (
                  <p className="text-[9px] text-gray-400 px-0.5">+{dayItems.length - 4} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Mobile: list for this week */}
      <div className="md:hidden">
        {weekItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No phases this week</p>
        ) : (
          <div className="space-y-2">
            {weekItems.map(item => (
              <button
                key={item.id}
                onClick={() => onEdit(item)}
                className="w-full text-left bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: itemBarColor(item) }} />
                    <span className="text-sm font-medium text-navy-800 truncate">{item.title}</span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-xs text-gray-400">{fmtRange(item.start_date, item.end_date)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MONTH VIEW ───────────────────────────────────────────────────────────────
// Spanning bars — each item is a continuous colored bar across its dates,
// stacked into lanes to avoid overlap, matching BuilderTrend calendar style.

const MAX_BAR_SLOTS = 3 // visible event rows per week before "+N more"
const BAR_H = 18       // px — height of each event bar
const BAR_GAP = 3      // px — gap between bars
const DAY_NUM_H = 24   // px — space for day number at top
const WEEK_ROW_MIN = DAY_NUM_H + MAX_BAR_SLOTS * (BAR_H + BAR_GAP) + 8

function MonthView({ items, onEdit }: { items: ScheduleItem[]; onEdit: (i: ScheduleItem) => void }) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })

  const yr   = cursor.getFullYear()
  const mo   = cursor.getMonth()
  const today = new Date()
  const startPad = new Date(yr, mo, 1).getDay()      // 0–6 (Sun-based)
  const daysInMonth = new Date(yr, mo + 1, 0).getDate()

  // First cell in the grid (may be in previous month)
  const gridStart = new Date(yr, mo, 1 - startPad)

  // Total cells needed (padded to full weeks)
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7
  const numWeeks = totalCells / 7

  function prevMonth() { setCursor(new Date(yr, mo - 1, 1)) }
  function nextMonth() { setCursor(new Date(yr, mo + 1, 1)) }
  function goToday()   { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)) }

  function cellDate(weekIdx: number, dayIdx: number): Date {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + weekIdx * 7 + dayIdx)
    return d
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-4">
      {/* Nav */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={16} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-navy-800">
            {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button
            onClick={goToday}
            className="text-[11px] font-semibold text-gold-600 hover:text-gold-700 border border-gold-300 px-2 py-0.5 rounded-md transition-colors"
          >
            Today
          </button>
        </div>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-100 mb-0">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="border-l border-gray-100">
        {Array.from({ length: numWeeks }, (_, weekIdx) => {
          const weekStartDate = cellDate(weekIdx, 0)
          const weekEndDate   = cellDate(weekIdx, 6)

          // Items overlapping this week
          const overlapping = items
            .filter(item => {
              const s = parseDay(item.start_date)
              const e = parseDay(item.end_date)
              return s <= weekEndDate && e >= weekStartDate
            })
            .sort((a, b) =>
              parseDay(a.start_date).getTime() - parseDay(b.start_date).getTime()
            )

          // Slot assignment: greedy algorithm, track occupied columns per slot
          const slotOcc: boolean[][] = []  // slotOcc[slot][col 0-6]
          const itemSlot = new Map<string, number>()

          for (const item of overlapping) {
            const s = parseDay(item.start_date)
            const e = parseDay(item.end_date)
            const cS = Math.max(0, Math.min(6, daysBetween(weekStartDate, s)))
            const cE = Math.max(0, Math.min(6, daysBetween(weekStartDate, e)))

            let slot = 0
            // eslint-disable-next-line no-constant-condition
            while (true) {
              if (!slotOcc[slot]) slotOcc[slot] = Array(7).fill(false)
              let conflict = false
              for (let c = cS; c <= cE; c++) {
                if (slotOcc[slot][c]) { conflict = true; break }
              }
              if (!conflict) {
                for (let c = cS; c <= cE; c++) slotOcc[slot][c] = true
                itemSlot.set(item.id, slot)
                break
              }
              slot++
            }
          }

          const visibleItems = overlapping.filter(item => (itemSlot.get(item.id) ?? 99) < MAX_BAR_SLOTS)
          const hiddenCount  = overlapping.length - visibleItems.length

          return (
            <div
              key={weekIdx}
              className="relative border-b border-r border-gray-100"
              style={{ minHeight: WEEK_ROW_MIN }}
            >
              {/* Day cell backgrounds + day numbers */}
              <div className="grid grid-cols-7 h-full absolute inset-0">
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const day = cellDate(weekIdx, dayIdx)
                  const isCurMo = day.getMonth() === mo
                  const isToday  = day.toDateString() === today.toDateString()
                  return (
                    <div
                      key={dayIdx}
                      className={`border-r border-gray-100 last:border-r-0 pt-1 px-1 ${
                        isCurMo ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 text-[11px] font-medium flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-gold-500 text-white'
                            : isCurMo
                              ? 'text-gray-600'
                              : 'text-gray-300'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Event bars — absolutely positioned over the day grid */}
              <div className="absolute inset-x-0 pointer-events-none" style={{ top: DAY_NUM_H }}>
                {visibleItems.map(item => {
                  const s = parseDay(item.start_date)
                  const e = parseDay(item.end_date)
                  const slotIdx    = itemSlot.get(item.id) ?? 0
                  const colStart   = Math.max(0, Math.min(6, daysBetween(weekStartDate, s)))
                  const colEnd     = Math.max(0, Math.min(6, daysBetween(weekStartDate, e)))
                  const startsHere = s >= weekStartDate
                  const endsHere   = e <= weekEndDate
                  const color      = itemBarColor(item)

                  const leftPct  = (colStart / 7) * 100
                  const widthPct = ((colEnd - colStart + 1) / 7) * 100

                  return (
                    <button
                      key={item.id}
                      onClick={() => onEdit(item)}
                      title={`${item.title} · ${fmtRange(item.start_date, item.end_date)}`}
                      className="absolute flex items-center text-white text-[10px] font-semibold hover:opacity-80 transition-opacity pointer-events-auto overflow-hidden"
                      style={{
                        top: slotIdx * (BAR_H + BAR_GAP),
                        height: BAR_H,
                        left: `calc(${leftPct}% + ${startsHere ? 2 : 0}px)`,
                        width: `calc(${widthPct}% - ${startsHere ? 2 : 0}px - ${endsHere ? 2 : 0}px)`,
                        backgroundColor: color,
                        borderRadius: `${startsHere ? 3 : 0}px ${endsHere ? 3 : 0}px ${endsHere ? 3 : 0}px ${startsHere ? 3 : 0}px`,
                        paddingLeft: startsHere ? 6 : 2,
                        paddingRight: 4,
                      }}
                    >
                      {/* Only show title if bar starts in this week (avoids duplicate labels for multi-week items) */}
                      {(startsHere || colStart === 0) && (
                        <span className="truncate whitespace-nowrap">{item.title}</span>
                      )}
                    </button>
                  )
                })}

                {/* Overflow indicator */}
                {hiddenCount > 0 && (
                  <div
                    className="absolute right-2 text-[10px] text-gray-400 font-medium"
                    style={{ top: MAX_BAR_SLOTS * (BAR_H + BAR_GAP) + 2 }}
                  >
                    +{hiddenCount} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: list of items this month */}
      <div className="mt-4 md:hidden">
        {items.filter(item => {
          const s = parseDay(item.start_date)
          const e = parseDay(item.end_date)
          const ms = new Date(yr, mo, 1)
          const me = new Date(yr, mo + 1, 0)
          return s <= me && e >= ms
        }).length === 0 ? null : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">This month</p>
            {items
              .filter(item => {
                const s = parseDay(item.start_date)
                const e = parseDay(item.end_date)
                const ms = new Date(yr, mo, 1)
                const me = new Date(yr, mo + 1, 0)
                return s <= me && e >= ms
              })
              .map(item => (
                <button
                  key={item.id}
                  onClick={() => onEdit(item)}
                  className="w-full text-left bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: itemBarColor(item) }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtRange(item.start_date, item.end_date)}</p>
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── YEAR VIEW ────────────────────────────────────────────────────────────────

function YearView({ items, onEdit }: { items: ScheduleItem[]; onEdit: (i: ScheduleItem) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear())

  const yearStart = new Date(year, 0, 1)
  const yearEnd   = new Date(year, 11, 31)
  const yearRange = yearEnd.getTime() + 86_400_000 - yearStart.getTime()
  const today     = new Date()
  const todayPct  = year === today.getFullYear()
    ? ((today.getTime() - yearStart.getTime()) / yearRange) * 100
    : null

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const visibleItems = useMemo(() =>
    items.filter(item => {
      const s = parseDay(item.start_date).getTime()
      const e = parseDay(item.end_date).getTime() + 86_400_000
      return s < yearEnd.getTime() + 86_400_000 && e > yearStart.getTime()
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, year])

  function barStyle(item: ScheduleItem): React.CSSProperties {
    const s = parseDay(item.start_date)
    const e = parseDay(item.end_date)
    const cS = s < yearStart ? yearStart : s
    const cE = e > yearEnd   ? yearEnd   : e
    const left  = ((cS.getTime() - yearStart.getTime()) / yearRange) * 100
    const width = Math.max(0.5, ((cE.getTime() + 86_400_000 - cS.getTime()) / yearRange) * 100)
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - Math.max(0, left), width)}%`,
      minWidth: 4,
      backgroundColor: itemBarColor(item),
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 gap-2">
        <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={16} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-navy-800">{year}</h3>
          <button
            onClick={() => setYear(new Date().getFullYear())}
            className="text-[11px] font-semibold text-gold-600 hover:text-gold-700 border border-gold-300 px-2 py-0.5 rounded-md transition-colors"
          >
            This Year
          </button>
        </div>
        <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={16} className="text-gray-500" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }}>
          {/* Month ruler */}
          <div className="relative h-7 border-b border-gray-100">
            {MONTHS.map((m, i) => (
              <div
                key={m}
                className="absolute top-0 bottom-0 flex items-center justify-center"
                style={{ left: `${(i / 12) * 100}%`, width: `${100 / 12}%` }}
              >
                <span className="text-[10px] font-semibold text-gray-400 tracking-wide">{m}</span>
              </div>
            ))}
            {MONTHS.map((_, i) => (
              <div
                key={`div-${i}`}
                className="absolute top-2 bottom-0 w-px bg-gray-100"
                style={{ left: `${(i / 12) * 100}%` }}
              />
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No phases in {year}</p>
          ) : (
            visibleItems.map(item => (
              <div key={item.id} className="relative h-9 flex items-center border-b border-gray-50">
                {MONTHS.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${(i / 12) * 100}%` }} />
                ))}
                {todayPct !== null && (
                  <div className="absolute top-0 bottom-0 w-px bg-gold-400/70 z-10" style={{ left: `${todayPct}%` }} />
                )}
                <div
                  onClick={() => onEdit(item)}
                  title={`${item.title} · ${fmtRange(item.start_date, item.end_date)}`}
                  className="absolute h-6 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden text-white"
                  style={barStyle(item)}
                >
                  <span className="text-[10px] font-semibold truncate px-2 whitespace-nowrap pointer-events-none">
                    {item.title}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Mobile summary */}
      {visibleItems.length > 0 && (
        <div className="mt-4 md:hidden space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            {year} · {visibleItems.length} phase{visibleItems.length !== 1 ? 's' : ''}
          </p>
          {visibleItems.map(item => (
            <button
              key={item.id}
              onClick={() => onEdit(item)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: itemBarColor(item) }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-800 truncate">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtRange(item.start_date, item.end_date)}</p>
                </div>
              </div>
              <StatusBadge status={item.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

interface Props {
  items: ScheduleItem[]
  canCreate: boolean
  onAdd: () => void
  onEdit: (item: ScheduleItem) => void
}

export function ScheduleList({ items, canCreate, onAdd, onEdit }: Props) {
  const [view, setView] = useState<ScheduleView>('gantt')
  const [filters, setFilters] = useState<Filters>({ search: '', statuses: [], trades: [] })
  const [showFilters, setShowFilters] = useState(false)

  const allTrades = useMemo(() => {
    const set = new Set(items.map(i => i.trade).filter((t): t is string => Boolean(t)))
    return Array.from(set).sort()
  }, [items])

  const filteredItems = useMemo(() => items.filter(item => {
    if (
      filters.search &&
      !item.title.toLowerCase().includes(filters.search.toLowerCase()) &&
      !(item.trade ?? '').toLowerCase().includes(filters.search.toLowerCase()) &&
      !(item.description ?? '').toLowerCase().includes(filters.search.toLowerCase())
    ) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false
    if (filters.trades.length > 0 && !filters.trades.includes(item.trade ?? '')) return false
    return true
  }), [items, filters])

  const activeFilterCount = (filters.search ? 1 : 0) + filters.statuses.length + filters.trades.length

  function toggleStatus(s: ScheduleItemStatus) {
    setFilters(f => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter(x => x !== s) : [...f.statuses, s],
    }))
  }

  function toggleTrade(t: string) {
    setFilters(f => ({
      ...f,
      trades: f.trades.includes(t) ? f.trades.filter(x => x !== t) : [...f.trades, t],
    }))
  }

  function clearFilters() {
    setFilters({ search: '', statuses: [], trades: [] })
  }

  // ── Empty state ──
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Schedule</h2>
          {canCreate && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add Phase
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
          <Calendar size={36} className="text-gray-200" />
          No phases scheduled yet
          {canCreate && (
            <button
              onClick={onAdd}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Add the first phase →
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
          Schedule
          <span className="ml-2 text-xs font-sans font-normal text-gray-400">
            {filteredItems.length !== items.length
              ? `${filteredItems.length} of ${items.length}`
              : `${items.length} phase${items.length !== 1 ? 's' : ''}`}
          </span>
        </h2>
        {canCreate && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={12} />
            <span className="hidden sm:inline">Add Phase</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* View switcher + filter toggle */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <div className="flex-1 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max">
            {VIEWS.map(v => {
              const Icon = v.icon
              const active = view === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-navy-900 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-white hover:text-navy-800 hover:shadow-sm'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{v.label}</span>
                  <span className="sm:hidden">{v.short}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            showFilters || activeFilterCount > 0
              ? 'bg-navy-100 text-navy-800 shadow-sm'
              : 'text-gray-500 hover:bg-white hover:text-navy-800 hover:shadow-sm'
          }`}
        >
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">Filter</span>
          {activeFilterCount > 0 && (
            <span className="bg-gold-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="border-b border-gray-100 bg-white px-4 py-4 space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search phases, trades…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-400 transition-colors"
            />
            {filters.search && (
              <button
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map(s => {
                const c = STATUS_CFG[s]
                const active = filters.statuses.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                      active
                        ? `${c.bg} ${c.text} ${c.border}`
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${active ? c.dot : 'bg-gray-300'}`} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {allTrades.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Trade</p>
              <div className="flex flex-wrap gap-1.5">
                {allTrades.map(t => {
                  const active = filters.trades.includes(t)
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTrade(t)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                        active
                          ? 'bg-navy-100 text-navy-800 border-navy-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* No results */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">No phases match the current filters</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-xs text-gold-600 hover:text-gold-700 font-medium transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {view === 'list'  && <ListView  items={filteredItems} onEdit={onEdit} />}
          {view === 'gantt' && <GanttView items={filteredItems} onEdit={onEdit} />}
          {view === 'week'  && <WeekView  items={filteredItems} onEdit={onEdit} />}
          {view === 'month' && <MonthView items={filteredItems} onEdit={onEdit} />}
          {view === 'year'  && <YearView  items={filteredItems} onEdit={onEdit} />}
        </>
      )}
    </div>
  )
}
