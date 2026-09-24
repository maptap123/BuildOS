'use client'

// Shared building blocks for the cross-job summary pages (/schedule, /logs,
// /tasks, /finance) — the screens a module opens to when no job is selected.

import { Search, X } from 'lucide-react'

export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Header ───────────────────────────────────────────────────────────────────

export function SummaryHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 px-1">
      <p className="text-[10px] font-bold tracking-[0.15em] text-gold-600 uppercase">All Jobs</p>
      <h1 className="font-display text-2xl font-bold text-navy-900 leading-tight">{title}</h1>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ── Stat tiles (tap to filter) ───────────────────────────────────────────────

export interface StatTileProps {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'alert' | 'good' | 'gold'
  active?: boolean
  onClick?: () => void
}

const TONE: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-navy-900',
  alert:   'text-red-600',
  good:    'text-green-700',
  gold:    'text-gold-600',
}

export function StatTile({ label, value, sub, tone = 'default', active, onClick }: StatTileProps) {
  const cls = `text-left bg-white rounded-xl border px-3.5 py-3 transition-colors ${
    active ? 'border-navy-900 ring-1 ring-navy-900' : 'border-border'
  } ${onClick ? 'hover:border-gray-400 active:bg-gray-50' : ''}`
  const body = (
    <>
      <p className="text-[11px] text-gray-500 font-medium leading-tight">{label}</p>
      <p className={`font-display font-semibold text-xl leading-tight mt-0.5 tabular-nums ${TONE[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={active} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">{children}</div>
}

// ── Filter controls ──────────────────────────────────────────────────────────

export interface ChipOption<T extends string> { key: T; label: string; count?: number }

export function FilterChips<T extends string>({
  options, value, onChange, label,
}: {
  options: ChipOption<T>[]
  value: T
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
      {label && <span className="text-[11px] text-gray-500 font-semibold shrink-0 mr-0.5">{label}</span>}
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            value === o.key
              ? 'bg-navy-900 text-white'
              : 'bg-white border border-border text-gray-600 hover:text-navy-900 hover:border-gray-400'
          }`}
        >
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  )
}

export function FilterSelect({
  label, value, onChange, options, allLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  allLabel: string
}) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0 flex-1 md:flex-none md:w-52">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-0.5">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-white border rounded-lg px-2.5 py-2 text-sm truncate focus:outline-none focus:ring-2 focus:ring-gold-400 ${
          value ? 'border-navy-900 text-navy-900 font-medium' : 'border-border text-gray-600'
        }`}
      >
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-0 md:max-w-xs">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      />
    </div>
  )
}

export function FilterPanel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2.5 mb-4">{children}</div>
}

// ── "Showing X of Y · filter · filter  [Clear]" ─────────────────────────────

// A filter left at its default has no onRemove — it shows as a plain pill,
// since "removing" it would only reset it to the same value.
export interface ActiveFilter { key: string; label: string; onRemove?: () => void }

export function FilterSummary({
  shown, total, noun, filters, onClearAll,
}: {
  shown: number
  total: number
  noun: string
  filters: ActiveFilter[]
  onClearAll: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3 px-1 text-xs">
      <span className="text-gray-500">
        Showing <span className="font-semibold text-navy-900 tabular-nums">{shown}</span>
        {shown !== total && <> of <span className="tabular-nums">{total}</span></>} {noun}
      </span>
      {filters.map(f => !f.onRemove ? (
        <span key={f.key} className="inline-flex items-center bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
          {f.label}
        </span>
      ) : (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          className="inline-flex items-center gap-1 bg-gold-50 border border-gold-300 text-navy-900 rounded-full pl-2 pr-1.5 py-0.5 font-medium hover:bg-gold-100"
          aria-label={`Remove filter ${f.label}`}
        >
          {f.label}
          <X size={11} className="text-gray-500" />
        </button>
      ))}
      {filters.filter(f => f.onRemove).length > 1 && (
        <button type="button" onClick={onClearAll} className="text-gold-600 font-semibold ml-1">
          Clear all
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, message, action }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3 bg-white rounded-xl border border-border">
      <Icon size={36} className="text-gray-200" />
      <p className="text-sm font-medium text-center px-6">{message}</p>
      {action}
    </div>
  )
}
