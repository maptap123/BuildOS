'use client'

import type { EstimateLine } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

interface Props {
  lines: EstimateLine[]
}

export function EstimateTotals({ lines }: Props) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
  const markup   = lines.reduce((s, l) => s + l.quantity * l.unit_cost * (l.markup_pct / 100), 0)
  const total    = subtotal + markup

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Summary</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Subtotal (cost)</span>
          <span className="font-medium text-navy-800 tabular-nums">{fmt(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Markup</span>
          <span className="font-medium text-navy-800 tabular-nums">{fmt(markup)}</span>
        </div>
        <div className="border-t border-gray-100 pt-2 mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-navy-900">Total</span>
          <span className="text-lg font-bold text-navy-900 tabular-nums">{fmt(total)}</span>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-2">By Phase</p>
          {Array.from(
            lines.reduce((map, l) => {
              const phase = l.phase ?? 'Unassigned'
              const lineTotal = l.quantity * l.unit_cost * (1 + l.markup_pct / 100)
              map.set(phase, (map.get(phase) ?? 0) + lineTotal)
              return map
            }, new Map<string, number>())
          ).map(([phase, phaseTotal]) => (
            <div key={phase} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-gray-500">{phase}</span>
              <span className="text-navy-700 tabular-nums font-medium">{fmt(phaseTotal)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
