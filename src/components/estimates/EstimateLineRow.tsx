'use client'

import { useState } from 'react'
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { EstimateLine } from '@/types'

interface Props {
  line: EstimateLine
  canEdit: boolean
  canDelete: boolean
  onChange: (id: string, field: keyof EstimateLine, value: string | number) => void
  onDelete: (id: string) => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

function lineTotal(line: EstimateLine): number {
  const cost    = line.quantity * line.unit_cost
  const markup  = cost * (line.markup_pct / 100)
  return cost + markup
}

export function EstimateLineRow({ line, canEdit, canDelete, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const total = lineTotal(line)

  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
        {/* expand toggle */}
        <td className="pl-3 pr-1 py-2.5 w-6">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </td>

        {/* description */}
        <td className="px-2 py-2.5">
          {canEdit ? (
            <input
              value={line.description}
              onChange={e => onChange(line.id, 'description', e.target.value)}
              className="w-full text-sm text-navy-800 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5 min-w-[160px]"
            />
          ) : (
            <span className="text-sm text-navy-800">{line.description}</span>
          )}
          {line.cost_code && (
            <span className="text-[10px] text-gray-400 font-mono ml-1">{line.cost_code}</span>
          )}
        </td>

        {/* phase */}
        <td className="px-2 py-2.5 w-28 hidden md:table-cell">
          {canEdit ? (
            <input
              value={line.phase ?? ''}
              onChange={e => onChange(line.id, 'phase', e.target.value)}
              placeholder="—"
              className="w-full text-xs text-gray-500 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5"
            />
          ) : (
            <span className="text-xs text-gray-500">{line.phase ?? '—'}</span>
          )}
        </td>

        {/* uom */}
        <td className="px-2 py-2.5 w-16 text-xs text-gray-500 text-center hidden md:table-cell">
          {line.uom}
        </td>

        {/* qty */}
        <td className="px-2 py-2.5 w-20">
          {canEdit ? (
            <input
              type="number"
              min="0"
              step="any"
              value={line.quantity}
              onChange={e => onChange(line.id, 'quantity', e.target.value)}
              className="w-full text-sm text-right text-navy-700 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5 tabular-nums"
            />
          ) : (
            <span className="text-sm text-right text-navy-700 tabular-nums block">{line.quantity}</span>
          )}
        </td>

        {/* unit cost */}
        <td className="px-2 py-2.5 w-28">
          {canEdit ? (
            <div className="relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.unit_cost}
                onChange={e => onChange(line.id, 'unit_cost', e.target.value)}
                className="w-full text-sm text-right text-navy-700 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5 pl-3 tabular-nums"
              />
            </div>
          ) : (
            <span className="text-sm text-right text-navy-700 tabular-nums block">{fmt(line.unit_cost)}</span>
          )}
        </td>

        {/* markup % */}
        <td className="px-2 py-2.5 w-20 hidden md:table-cell">
          {canEdit ? (
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.5"
                value={line.markup_pct}
                onChange={e => onChange(line.id, 'markup_pct', e.target.value)}
                className="w-full text-sm text-right text-navy-700 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5 pr-4 tabular-nums"
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
          ) : (
            <span className="text-sm text-right text-navy-700 tabular-nums block">{line.markup_pct}%</span>
          )}
        </td>

        {/* line total */}
        <td className="px-2 py-2.5 w-28 text-right">
          <span className="text-sm font-semibold text-navy-900 tabular-nums">{fmt(total)}</span>
        </td>

        {/* delete */}
        <td className="pr-3 pl-1 py-2.5 w-8">
          {canDelete && (
            <button
              onClick={() => onDelete(line.id)}
              className="text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>

      {/* Expanded notes row */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-10 pb-3 pt-1">
            {canEdit ? (
              <input
                value={line.notes ?? ''}
                onChange={e => onChange(line.id, 'notes', e.target.value)}
                placeholder="Add notes for this line…"
                className="w-full text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gold-400"
              />
            ) : (
              <p className="text-xs text-gray-400 italic">{line.notes || 'No notes'}</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
