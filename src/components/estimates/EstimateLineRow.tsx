'use client'

import { useState } from 'react'
import { Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Search, Loader2 } from 'lucide-react'
import type { EstimateLine } from '@/types'

interface Props {
  line: EstimateLine
  canEdit: boolean
  canDelete: boolean
  onChange: (id: string, field: keyof EstimateLine, value: string | number | boolean) => void
  onDelete: (id: string) => void
}

interface PriceLookupResult {
  retailer:     string
  product_name: string
  price_cents:  number
  sku?:         string
  url?:         string
}

interface PriceLookupResponse {
  source:    'cache' | 'live' | 'unavailable'
  results:   PriceLookupResult[]
  message?:  string
  cached_at?: string | null
}

const RETAILER_LABELS: Record<string, string> = {
  home_depot: 'Home Depot',
  lowes:      "Lowe's",
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

function lineTotal(line: EstimateLine): number {
  const cost   = line.quantity * line.unit_cost
  const markup = cost * (line.markup_pct / 100)
  return cost + markup
}

async function persistVisibility(id: string, client_visible: boolean) {
  await fetch(`/api/estimate-lines/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ client_visible }),
  })
}

export function EstimateLineRow({ line, canEdit, canDelete, onChange, onDelete }: Props) {
  const [expanded, setExpanded]           = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResults, setLookupResults] = useState<PriceLookupResult[] | null>(null)
  const [lookupSource, setLookupSource]   = useState<PriceLookupResponse['source'] | null>(null)
  const [lookupMsg, setLookupMsg]         = useState<string | null>(null)

  const total    = lineTotal(line)
  const isHidden = line.client_visible === false

  function toggleVisibility() {
    const next = !line.client_visible
    onChange(line.id, 'client_visible', next)
    persistVisibility(line.id, next)
  }

  async function handleLookup() {
    if (!line.description) return
    setLookupLoading(true)
    setLookupResults(null)
    setLookupMsg(null)
    try {
      const res  = await fetch(`/api/materials/price-search?q=${encodeURIComponent(line.description)}&zip=90210`)
      const data = (await res.json()) as PriceLookupResponse
      setLookupSource(data.source)
      setLookupResults(data.results.slice(0, 4))
      if (data.source === 'unavailable') setLookupMsg(data.message ?? 'Price lookup not configured')
    } catch {
      setLookupMsg('Failed to fetch prices')
    } finally {
      setLookupLoading(false)
    }
  }

  function applyPrice(priceCents: number) {
    onChange(line.id, 'unit_cost', priceCents / 100)
    setLookupResults(null)
    setLookupSource(null)
  }

  return (
    <>
      <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors group${isHidden ? ' bg-gray-50/60' : ''}`}>
        {/* expand toggle */}
        <td className="pl-3 pr-1 py-2.5 w-6">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </td>

        {/* visibility toggle */}
        <td className="px-1 py-2.5 w-6">
          {canEdit && (
            <button
              onClick={toggleVisibility}
              title={isHidden ? 'Hidden from client — click to show' : 'Visible to client — click to hide'}
              className={`transition-colors ${isHidden ? 'text-gray-300 hover:text-navy-500' : 'text-gray-300 hover:text-gray-500'}`}
            >
              {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </td>

        {/* description */}
        <td className={`px-2 py-2.5${isHidden ? ' opacity-50' : ''}`}>
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
          {isHidden && (
            <span className="ml-2 text-[10px] font-semibold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
              Internal only
            </span>
          )}
        </td>

        {/* phase */}
        <td className={`px-2 py-2.5 w-28 hidden md:table-cell${isHidden ? ' opacity-50' : ''}`}>
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
        <td className={`px-2 py-2.5 w-16 text-xs text-gray-500 text-center hidden md:table-cell${isHidden ? ' opacity-50' : ''}`}>
          {line.uom}
        </td>

        {/* qty */}
        <td className={`px-2 py-2.5 w-20${isHidden ? ' opacity-50' : ''}`}>
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
        <td className={`px-2 py-2.5 w-28${isHidden ? ' opacity-50' : ''}`}>
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
        <td className={`px-2 py-2.5 w-20 hidden md:table-cell${isHidden ? ' opacity-50' : ''}`}>
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
        <td className={`px-2 py-2.5 w-28 text-right${isHidden ? ' opacity-50' : ''}`}>
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

      {/* Expanded notes + price lookup row */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="px-10 pb-3 pt-1 space-y-2">
            {canEdit ? (
              <>
                <input
                  value={line.notes ?? ''}
                  onChange={e => onChange(line.id, 'notes', e.target.value)}
                  placeholder="Add notes for this line…"
                  className="w-full text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gold-400"
                />
                <input
                  value={line.internal_note ?? ''}
                  onChange={e => onChange(line.id, 'internal_note', e.target.value)}
                  placeholder="Internal note (not shown to client)…"
                  className="w-full text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gold-400"
                />
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400 italic">{line.notes || 'No notes'}</p>
                {line.internal_note && (
                  <p className="text-xs text-amber-700 italic">Internal: {line.internal_note}</p>
                )}
              </>
            )}

            {/* Price Lookup */}
            {canEdit && (
              <div className="pt-1 border-t border-gray-200 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={handleLookup}
                    disabled={lookupLoading || !line.description}
                    className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-800 font-medium transition-colors disabled:opacity-40"
                  >
                    {lookupLoading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Search size={12} />
                    }
                    {lookupLoading ? 'Searching…' : 'Look up price'}
                  </button>
                  {lookupSource === 'cache' && (
                    <span className="text-[10px] text-gray-400">cached</span>
                  )}
                </div>

                {lookupMsg && (
                  <p className="text-xs text-gray-400 italic">{lookupMsg}</p>
                )}

                {lookupResults && lookupResults.length === 0 && !lookupMsg && (
                  <p className="text-xs text-gray-400 italic">No prices found for this item.</p>
                )}

                {lookupResults && lookupResults.length > 0 && (
                  <div className="space-y-1">
                    {lookupResults.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-semibold bg-navy-100 text-navy-700 px-1.5 py-0.5 rounded mr-2">
                            {RETAILER_LABELS[r.retailer] ?? r.retailer}
                          </span>
                          <span className="text-xs text-gray-700 truncate">{r.product_name}</span>
                          {r.sku && (
                            <span className="text-[10px] text-gray-400 font-mono ml-2">#{r.sku}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold text-navy-900 tabular-nums">
                            {fmt(r.price_cents / 100)}
                          </span>
                          <button
                            onClick={() => applyPrice(r.price_cents)}
                            className="text-[10px] font-semibold text-gold-700 hover:text-gold-800 bg-gold-50 hover:bg-gold-100 px-2 py-0.5 rounded transition-colors"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
