import type { CostClass } from '@/lib/owners/data'

// Owners View runs in a dark "trading terminal" skin. Series colors were run through the
// dataviz validator against PANEL (#101d30): cost classes are the standard categorical
// slots 1–4 in order; Spent (violet) and Billed (darkened JDC gold) pass as a pair too.
export const C = {
  page: '#0b1623',
  panel: '#101d30',
  panel2: '#14243b',
  border: '#1f3150',
  grid: '#1c2c47',
  text: '#eef3fb',
  text2: '#a9b8cf',
  muted: '#6f83a3',
  spent: '#9085e9',
  billed: '#b88a2c',
  budget: '#5b6f8f',
  good: '#4ade80',
  warn: '#fbbf24',
  bad: '#f87171',
} as const

export const CLASS_COLOR: Record<CostClass, string> = {
  labor: '#3987e5',
  material: '#d95926',
  sub: '#199e70',
  other: '#c98500',
}

export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function moneyShort(n: number): string {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`
  if (a >= 10_000) return `${s}$${Math.round(a / 1000)}k`
  if (a >= 1_000) return `${s}$${(a / 1000).toFixed(1)}k`
  return `${s}$${Math.round(a)}`
}

export const pct = (n: number | null, digits = 1) => (n == null ? '—' : `${n.toFixed(digits)}%`)

export const hoursFmt = (h: number) => (h >= 100 ? Math.round(h).toLocaleString() : h.toFixed(1))

export type Tone = 'good' | 'warn' | 'bad' | 'none'

/** JDC prices at ~50% markup (~33% margin); under 10% on billings is a problem. */
export function marginTone(m: number | null): Tone {
  if (m == null) return 'none'
  if (m >= 20) return 'good'
  if (m >= 10) return 'warn'
  return 'bad'
}

export const TONE_COLOR: Record<Tone, string> = { good: C.good, warn: C.warn, bad: C.bad, none: C.muted }

export function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
