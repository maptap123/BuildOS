'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { C, moneyShort, shortDate } from './theme'

// Hand-rolled SVG charts for the Owners View — no chart library in the bundle. Every
// plotted chart has a hover layer (crosshair or per-mark tooltip); text stays in text
// tokens, color only rides on the marks.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return step * exp
}

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const W = 190
  const left = Math.min(Math.max(x + 12, 0), Math.max(0, width - W))
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ left, top: Math.max(0, y - 10), width: W, background: '#0a1422', border: `1px solid ${C.border}`, color: C.text }}
    >
      {children}
    </div>
  )
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5" style={{ color: C.text2 }}>
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.text2 }}>
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="font-mono tabular-nums" style={{ color: C.text }}>{i.value}</span>}
        </span>
      ))}
    </div>
  )
}

// ── Sparkline (tile) ─────────────────────────────────────────────────────────

export function Sparkline({ values, color = C.spent, height = 36 }: { values: number[]; color?: string; height?: number }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const max = Math.max(...values, 0)
  const w = width || 200
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * (w - 4) + 2 : w / 2
    const y = max > 0 ? height - 3 - (v / max) * (height - 8) : height - 3
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const id = `spark-${color.slice(1)}`
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {max > 0 && <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke={C.panel} strokeWidth={2} />}
        </svg>
      )}
    </div>
  )
}

// ── Weekly (stacked) bars ────────────────────────────────────────────────────

export interface BarSeries { key: string; label: string; color: string }

export function WeeklyBars({
  weeks, series, height = 220, format = moneyShort, tipFormat,
}: {
  weeks: { week: string; values: Record<string, number> }[]
  series: BarSeries[]
  height?: number
  format?: (n: number) => string
  tipFormat?: (n: number) => string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 48, padR = 8, padT = 10, padB = 24
  const totals = weeks.map(w => series.reduce((s, k) => s + Math.max(0, w.values[k.key] ?? 0), 0))
  const max = niceMax(Math.max(...totals, 0))
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const slot = weeks.length ? plotW / weeks.length : 0
  const barW = Math.max(2, Math.min(28, slot - 2))
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 56))))
  const tf = tipFormat ?? format

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Weekly totals bar chart">
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={C.grid} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.muted}>{format(t)}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = padL + slot * i + slot / 2
            let acc = 0
            const segs = series.map(s => {
              const v = Math.max(0, w.values[s.key] ?? 0)
              const y0 = y(acc)
              acc += v
              const y1 = y(acc)
              return { s, v, top: y1, h: y0 - y1 }
            }).filter(g => g.h > 0)
            return (
              <g key={w.week} opacity={hover == null || hover === i ? 1 : 0.45}>
                {segs.map((g, si) => {
                  const isTop = si === segs.length - 1
                  // 2px surface gap between stacked fills; rounded data-end only on the top segment
                  const h = Math.max(0, g.h - (isTop ? 0 : 2))
                  return isTop ? (
                    <path key={g.s.key} fill={g.s.color}
                      d={roundTopRect(cx - barW / 2, g.top, barW, h, Math.min(4, barW / 2, h))} />
                  ) : (
                    <rect key={g.s.key} x={cx - barW / 2} y={g.top + 2} width={barW} height={h} fill={g.s.color} />
                  )
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill={C.muted}>{shortDate(w.week)}</text>
                )}
                <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
          <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke={C.border} strokeWidth={1} />
        </svg>
      )}
      {hover != null && weeks[hover] && (
        <Tooltip x={padL + slot * hover + slot / 2} y={padT} width={width}>
          <div className="mb-1 font-semibold">Week of {shortDate(weeks[hover].week)}</div>
          {series.length > 1 && [...series].reverse().map(s => (
            <TipRow key={s.key} color={s.color} label={s.label} value={tf(weeks[hover].values[s.key] ?? 0)} />
          ))}
          <TipRow label={series.length > 1 ? 'Total' : series[0]?.label ?? 'Total'} value={tf(totals[hover])} />
        </Tooltip>
      )}
    </div>
  )
}

function roundTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  r = Math.max(0, Math.min(r, h))
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

// ── Cumulative spent vs billed (line, crosshair) ─────────────────────────────

export function CumulativeChart({
  points, budget, height = 280,
}: {
  points: { date: string; spent: number; billed: number }[]
  budget: number
  height?: number
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 56, padR = 72, padT = 14, padB = 26

  if (points.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm" style={{ color: C.muted }}>No costs or billings recorded yet.</div>
  }

  const t0 = Date.parse(`${points[0].date}T12:00:00Z`)
  const t1 = Date.parse(`${points[points.length - 1].date}T12:00:00Z`)
  const span = Math.max(1, t1 - t0)
  const max = niceMax(Math.max(...points.map(p => Math.max(p.spent, p.billed)), budget) * 1.05)
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const x = (d: string) => padL + ((Date.parse(`${d}T12:00:00Z`) - t0) / span) * plotW
  const y = (v: number) => padT + plotH - (v / max) * plotH
  // Step lines: money lands on a day and stays.
  const path = (k: 'spent' | 'billed') => points.map((p, i) => {
    const px = x(p.date).toFixed(1), py = y(p[k]).toFixed(1)
    if (i === 0) return `M${px},${py}`
    return `H${px} V${py}`
  }).join(' ')
  const spentPath = path('spent')
  const billedPath = path('billed')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const nX = Math.max(2, Math.min(6, Math.floor(plotW / 90)))
  const xTicks = Array.from({ length: nX }, (_, i) => new Date(t0 + (span * i) / (nX - 1)).toISOString().slice(0, 10))
  const last = points[points.length - 1]

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    if (mx < padL || mx > width - padR) { setHover(null); return }
    const t = t0 + ((mx - padL) / plotW) * span
    let idx = 0
    for (let i = 0; i < points.length; i++) {
      if (Date.parse(`${points[i].date}T12:00:00Z`) <= t) idx = i
      else break
    }
    setHover(idx)
  }

  const hp = hover != null ? points[hover] : null

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Cumulative spent versus billed">
          <defs>
            <linearGradient id="cum-spent" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.spent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.spent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={C.grid} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.muted}>{moneyShort(t)}</text>
            </g>
          ))}
          {xTicks.map(d => (
            <text key={d} x={x(d)} y={height - 8} textAnchor="middle" fontSize={10} fill={C.muted}>
              {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
            </text>
          ))}
          {budget > 0 && (
            <g>
              <line x1={padL} x2={width - padR} y1={y(budget)} y2={y(budget)} stroke={C.budget} strokeWidth={1.5} />
              <text x={width - padR + 4} y={y(budget) + 3} fontSize={10} fill={C.text2}>Est. {moneyShort(budget)}</text>
            </g>
          )}
          <path d={`${spentPath} V${y(0)} H${x(points[0].date)} Z`} fill="url(#cum-spent)" />
          <path d={billedPath} fill="none" stroke={C.billed} strokeWidth={2} strokeLinejoin="round" />
          <path d={spentPath} fill="none" stroke={C.spent} strokeWidth={2} strokeLinejoin="round" />
          {/* direct labels at the line ends */}
          <text x={width - padR + 4} y={y(last.billed) + 3} fontSize={10} fill={C.text}>Billed</text>
          <text x={width - padR + 4} y={y(last.spent) + (Math.abs(y(last.spent) - y(last.billed)) < 12 ? 15 : 3)} fontSize={10} fill={C.text}>Spent</text>
          {hp && (
            <g>
              <line x1={x(hp.date)} x2={x(hp.date)} y1={padT} y2={padT + plotH} stroke={C.text2} strokeWidth={1} />
              <circle cx={x(hp.date)} cy={y(hp.billed)} r={4} fill={C.billed} stroke={C.panel} strokeWidth={2} />
              <circle cx={x(hp.date)} cy={y(hp.spent)} r={4} fill={C.spent} stroke={C.panel} strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <Tooltip x={x(hp.date)} y={padT} width={width}>
          <div className="mb-1 font-semibold">{shortDate(hp.date)}</div>
          <TipRow color={C.billed} label="Billed to date" value={moneyShort(hp.billed)} />
          <TipRow color={C.spent} label="Spent to date" value={moneyShort(hp.spent)} />
          <TipRow label="Billed − spent" value={moneyShort(hp.billed - hp.spent)} />
        </Tooltip>
      )}
    </div>
  )
}

// ── 100% stacked mix bar ─────────────────────────────────────────────────────

export function MixBar({ parts }: { parts: { key: string; label: string; color: string; value: number }[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
  if (total <= 0) return <div className="text-sm" style={{ color: C.muted }}>No costs yet.</div>
  const shown = parts.filter(p => p.value > 0)
  const h = shown.find(p => p.key === hover)
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded">
          {shown.map(p => (
            <div key={p.key}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: hover && hover !== p.key ? 0.45 : 1 }} />
          ))}
        </div>
        {h && (
          <div className="mt-1 text-xs" style={{ color: C.text2 }}>
            <span style={{ color: C.text }}>{h.label}</span> · {moneyShort(h.value)} · {((h.value / total) * 100).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {parts.map(p => (
          <div key={p.key} className="flex items-center justify-between rounded-md px-2.5 py-1.5" style={{ background: C.panel2 }}>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.text2 }}>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.label}
            </span>
            <span className="text-right">
              <span className="block font-mono text-sm tabular-nums" style={{ color: C.text }}>{moneyShort(p.value)}</span>
              <span className="block text-[10px]" style={{ color: C.muted }}>{total > 0 ? ((p.value / total) * 100).toFixed(0) : 0}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
