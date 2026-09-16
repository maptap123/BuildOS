'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Plus, Loader2 } from 'lucide-react'
import type { CostCatalogItem } from '@/types'
import { DIVISION_NAMES } from '@/lib/estimates/divisions'

interface Props {
  onSelect: (item: CostCatalogItem) => void
}

interface DivisionOption {
  division_num: string
  division_name: string
  item_count: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

export function CostCatalogSearch({ onSelect }: Props) {
  const [query, setQuery]           = useState('')
  const [division, setDivision]     = useState('')
  const [results, setResults]       = useState<CostCatalogItem[]>([])
  const [loading, setLoading]       = useState(false)
  const [divisions, setDivisions]   = useState<DivisionOption[]>([])
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The dropdown's options come from their own endpoint, not from the items below it.
  // Deriving them from a page of items only ever found 01 and 02: the catalog is ordered
  // by division and those two alone cover the first 390 of 2,284 rows.
  useEffect(() => {
    fetch('/api/cost-catalog?facet=divisions')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: DivisionOption[]) => setDivisions(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [])

  // First page of items
  useEffect(() => {
    fetch('/api/cost-catalog?limit=50')
      .then(r => (r.ok ? r.json() : []))
      .then((items: CostCatalogItem[]) => setResults(Array.isArray(items) ? items : []))
      .catch(() => {})
  }, [])

  const search = useCallback(async (q: string, div: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '80' })
      if (q)   params.set('q', q)
      if (div) params.set('division', div)
      const res = await fetch(`/api/cost-catalog?${params}`)
      if (res.ok) setResults(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val, division), 280)
  }

  function handleDivisionChange(val: string) {
    setDivision(val)
    search(query, val)
  }

  function clear() {
    setQuery('')
    setDivision('')
    search('', '')
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost Catalog</h3>
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search items…"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
            {(query || division) && (
              <button
                onClick={clear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={division}
            onChange={e => handleDivisionChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
          >
            <option value="">All divisions</option>
            {divisions.map(d => (
              <option key={d.division_num} value={d.division_num}>
                {d.division_num} — {DIVISION_NAMES[d.division_num] ?? d.division_name} ({d.item_count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="overflow-y-auto max-h-72 divide-y divide-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-sm">Searching…</span>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            No items found
          </div>
        ) : (
          results.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gold-50 cursor-pointer group transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-mono text-gray-400 shrink-0">{item.cost_code}</span>
                  <span className="text-sm text-navy-800 font-medium truncate">{item.title}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {item.phase && (
                    <span className="text-[10px] text-gray-400">{item.phase}</span>
                  )}
                  <span className="text-[10px] text-gray-400">{item.division_name}</span>
                  <span className="text-[10px] text-gray-400">{item.uom}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-navy-700 tabular-nums">{fmt(item.unit_cost)}</p>
                <p className="text-[10px] text-gray-400">/{item.uom}</p>
              </div>
              <button
                onClick={() => onSelect(item)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-gold-100 text-gold-600 hover:bg-gold-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              >
                <Plus size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      {results.length > 0 && (
        <div className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
          {results.length} item{results.length !== 1 ? 's' : ''} shown
        </div>
      )}
    </div>
  )
}
