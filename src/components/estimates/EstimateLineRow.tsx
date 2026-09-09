'use client'

import { useEffect, useState } from 'react'
import { Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Search, Loader2 } from 'lucide-react'
import type { EstimateLine } from '@/types'
import { hasBreakdown, lineUnitCost } from '@/lib/estimates/costBreakdown'
import { normalizeCostCode } from '@/lib/estimates/costCodes'

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

function lineBuilderCost(line: EstimateLine): number {
  return line.quantity * lineUnitCost(line)
}

/**
 * One of the three cost buckets. Empty rather than 0 when unset, so a line that only
 * has labor does not read as though its material cost was priced at nothing.
 */
function CostInput({
  value, onChange, canEdit, placeholder,
}: {
  value: number | null
  onChange: (v: string) => void
  canEdit: boolean
  placeholder?: string
}) {
  if (!canEdit) {
    return (
      <span className="text-sm text-right text-navy-700 tabular-nums block">
        {value === null ? '—' : fmt(value)}
      </span>
    )
  }
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value ?? ''}
      placeholder={placeholder ?? '—'}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm text-right text-navy-700 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5 tabular-nums placeholder-gray-300"
    />
  )
}

function lineTotal(line: EstimateLine): number {
  return lineBuilderCost(line) * (1 + line.markup_pct / 100)
}

/**
 * Marks a line Fixer priced, and says where the name came from. Fixer never authors a
 * line name — it cites a past line or a cost code and the server copies the wording
 * from there — so the badge can always name a real origin.
 *
 * Keyed on source_line_id rather than comp_job_id: 84 of the 188 imported historical
 * estimates have no job link, so a comp line would otherwise read as "cost book".
 */
function AiSourceBadge({ line }: { line: EstimateLine }) {
  if (line.source !== 'ai_comp' && line.source !== 'ai_market') return null

  const fromComp = !!(line.source_line_id || line.comp_label || line.comp_job_id)

  const label = fromComp
    ? 'Fixer · comp'
    : line.cost_code
      ? 'Fixer · cost book'
      : 'Fixer · you named it'

  const origin = fromComp
    ? (line.comp_label ? `Priced from ${line.comp_label}` : 'Priced from a past JDC job')
    : line.cost_code
      ? `Named and priced from cost code ${line.cost_code}`
      : 'Fixer could not source this one; you named it'

  return (
    <span
      title={line.ai_rationale ? `${origin} — ${line.ai_rationale}` : origin}
      className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded whitespace-nowrap"
    >
      {label}
    </span>
  )
}

async function persistVisibility(id: string, client_visible: boolean) {
  await fetch(`/api/estimate-lines/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ client_visible }),
  })
}

// ── Retail price lookup (shared by desktop row + mobile card) ──────────────
function PriceLookupSection({ line, onChange }: Pick<Props, 'line' | 'onChange'>) {
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResults, setLookupResults] = useState<PriceLookupResult[] | null>(null)
  const [lookupSource, setLookupSource]   = useState<PriceLookupResponse['source'] | null>(null)
  const [lookupMsg, setLookupMsg]         = useState<string | null>(null)

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
  )
}

interface CatalogEntry {
  id: string
  cost_code: string
  title: string
  uom: string
  unit_cost: number
  labor_cost: number
  material_cost: number
  sub_cost: number
}

/**
 * Correcting the cost book from inside an estimate.
 *
 * Kept visibly apart from the line edit above it because the two do different things: the
 * line edit prices this job, this changes what every estimate written from here on picks
 * up for the code. JDC's prices move — the same enclosure was $2,000 in 2024 and $3,000 in
 * 2026 — so a correction has to land somewhere future estimates will read it, not only on
 * the line in front of you. Estimates already written keep their own copy either way.
 */
function CatalogPriceSection({
  line, onChange,
}: {
  line: EstimateLine
  onChange: Props['onChange']
}) {
  const code = line.cost_code?.trim() ?? ''
  const [entry, setEntry] = useState<CatalogEntry | null>(null)
  const [draft, setDraft] = useState({ labor_cost: '', material_cost: '', sub_cost: '' })
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'saving' | 'saved'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) { setStatus('missing'); return }
    let cancelled = false
    setStatus('loading')
    fetch(`/api/cost-catalog?q=${encodeURIComponent(code)}&limit=50`)
      .then(r => (r.ok ? r.json() : []))
      .then((items: CatalogEntry[]) => {
        if (cancelled) return
        // The search matches titles too, so pick the row whose code is actually this one.
        // Normalized because the cost book writes a trailing dot and the workbooks do not.
        const wanted = normalizeCostCode(code)
        const hit = Array.isArray(items)
          ? items.find(i => normalizeCostCode(i.cost_code) === wanted)
          : undefined
        if (!hit) { setStatus('missing'); return }
        setEntry(hit)
        setDraft({
          labor_cost:    String(hit.labor_cost ?? 0),
          material_cost: String(hit.material_cost ?? 0),
          sub_cost:      String(hit.sub_cost ?? 0),
        })
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('missing') })
    return () => { cancelled = true }
  }, [code])

  const n = (v: string) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  const draftTotal = n(draft.labor_cost) + n(draft.material_cost) + n(draft.sub_cost)

  async function save(applyToLine: boolean) {
    if (!entry) return
    setStatus('saving')
    setError(null)
    try {
      const res = await fetch(`/api/cost-catalog/${entry.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          labor_cost:    n(draft.labor_cost),
          material_cost: n(draft.material_cost),
          sub_cost:      n(draft.sub_cost),
        }),
      })
      const updated = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(updated.error ?? 'Failed to save the cost book')
      setEntry(updated)
      if (applyToLine) {
        onChange(line.id, 'labor_cost', updated.labor_cost)
        onChange(line.id, 'material_cost', updated.material_cost)
        onChange(line.id, 'sub_cost', updated.sub_cost)
      }
      setStatus('saved')
      setTimeout(() => setStatus('ready'), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the cost book')
      setStatus('ready')
    }
  }

  if (status === 'loading') {
    return (
      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Looking up the cost book…
      </p>
    )
  }

  if (!entry) {
    return (
      <p className="text-[11px] text-gray-400">
        {code
          ? `Cost code ${code} isn't in the cost book, so there is no shared price to change.`
          : 'No cost code on this line, so there is no cost book price to change.'}
      </p>
    )
  }

  const busy = status === 'saving'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <p className="text-[11px] font-semibold text-navy-700">
          Cost book price
          <span className="ml-1.5 font-mono text-gray-400">{entry.cost_code}</span>
        </p>
        <p className="text-[10px] text-gray-400 whitespace-nowrap">
          now {fmt(entry.unit_cost)} / {entry.uom}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          ['labor_cost', 'Labor'],
          ['material_cost', 'Material'],
          ['sub_cost', 'Sub'],
        ] as const).map(([field, label]) => (
          <label key={field} className="block">
            <span className="block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft[field]}
              onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
              className="w-full text-sm text-right text-navy-700 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gold-400 tabular-nums"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <p className="text-[11px] text-gray-500">
          New unit cost{' '}
          <span className="font-semibold text-navy-800 tabular-nums">{fmt(draftTotal)}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => save(false)}
            disabled={busy}
            className="text-[11px] font-semibold text-navy-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save to cost book'}
          </button>
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="text-[11px] font-semibold text-white bg-navy-700 rounded px-2 py-1 hover:bg-navy-800 disabled:opacity-50"
          >
            Save &amp; apply here
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 mt-1.5">
        Changes what future estimates price this code at. Estimates already written keep their own price.
      </p>
      {status === 'saved' && (
        <p className="text-[11px] text-green-600 font-semibold mt-1">Cost book updated.</p>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

export function EstimateLineRow({ line, canEdit, canDelete, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Once a line is priced in buckets, the unit cost is their sum and is not typed.
  const split = hasBreakdown(line)

  const builderCost = lineBuilderCost(line)
  const total       = lineTotal(line)
  const isHidden    = line.client_visible === false

  function toggleVisibility() {
    const next = !line.client_visible
    onChange(line.id, 'client_visible', next)
    persistVisibility(line.id, next)
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
          <span className="ml-2 inline-block align-middle">
            <AiSourceBadge line={line} />
          </span>
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

        {/* labor / material / sub */}
        <td className={`px-2 py-2.5 w-24${isHidden ? ' opacity-50' : ''}`}>
          <CostInput value={line.labor_cost} canEdit={canEdit}
            onChange={v => onChange(line.id, 'labor_cost', v)} />
        </td>
        <td className={`px-2 py-2.5 w-24${isHidden ? ' opacity-50' : ''}`}>
          <CostInput value={line.material_cost} canEdit={canEdit}
            onChange={v => onChange(line.id, 'material_cost', v)} />
        </td>
        <td className={`px-2 py-2.5 w-24${isHidden ? ' opacity-50' : ''}`}>
          <CostInput value={line.sub_cost} canEdit={canEdit}
            onChange={v => onChange(line.id, 'sub_cost', v)} />
        </td>

        {/* unit cost — the sum once any bucket is filled in, typed directly otherwise */}
        <td className={`px-2 py-2.5 w-28${isHidden ? ' opacity-50' : ''}`}>
          {canEdit && !split ? (
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
            <span
              className="text-sm text-right text-navy-700 tabular-nums block"
              title={split ? 'Labor + material + sub' : undefined}
            >
              {fmt(lineUnitCost(line))}
            </span>
          )}
        </td>

        {/* builder cost */}
        <td className={`px-2 py-2.5 w-28 text-right${isHidden ? ' opacity-50' : ''}`}>
          <span className="text-sm text-gray-500 tabular-nums">{fmt(builderCost)}</span>
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
          <td colSpan={14} className="px-10 pb-3 pt-1 space-y-2">
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

            {canEdit && <CatalogPriceSection line={line} onChange={onChange} />}
            {canEdit && <PriceLookupSection line={line} onChange={onChange} />}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Mobile card — same data as the table row, no horizontal scrolling ──────
export function EstimateLineCard({ line, canEdit, canDelete, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const split = hasBreakdown(line)

  const builderCost = lineBuilderCost(line)
  const total       = lineTotal(line)
  const isHidden    = line.client_visible === false

  function toggleVisibility() {
    const next = !line.client_visible
    onChange(line.id, 'client_visible', next)
    persistVisibility(line.id, next)
  }

  return (
    <div className={`px-4 py-3${isHidden ? ' bg-gray-50/60' : ''}`}>
      {/* Description + actions */}
      <div className="flex items-start gap-2">
        <div className={`flex-1 min-w-0${isHidden ? ' opacity-50' : ''}`}>
          {canEdit ? (
            <input
              value={line.description}
              onChange={e => onChange(line.id, 'description', e.target.value)}
              placeholder="Line description…"
              className="w-full text-sm text-navy-800 bg-transparent border-0 border-b border-transparent focus:border-gold-400 focus:outline-none py-0.5"
            />
          ) : (
            <span className="text-sm text-navy-800">{line.description}</span>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {line.cost_code && (
              <span className="text-[10px] text-gray-400 font-mono">{line.cost_code}</span>
            )}
            {isHidden && (
              <span className="text-[10px] font-semibold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                Internal only
              </span>
            )}
            <AiSourceBadge line={line} />
          </div>
        </div>
        {canEdit && (
          <button
            onClick={toggleVisibility}
            title={isHidden ? 'Hidden from client — tap to show' : 'Visible to client — tap to hide'}
            className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition-colors"
          >
            {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(line.id)}
            className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Qty / Unit cost / Markup */}
      <div className={`grid grid-cols-3 gap-2 mt-2${isHidden ? ' opacity-50' : ''}`}>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Qty{line.uom ? ` (${line.uom})` : ''}
          </span>
          {canEdit ? (
            <input
              type="number"
              min="0"
              step="any"
              value={line.quantity}
              onChange={e => onChange(line.id, 'quantity', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">{line.quantity}</span>
          )}
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Unit $</span>
          {canEdit && !split ? (
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.unit_cost}
              onChange={e => onChange(line.id, 'unit_cost', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">
              {fmt(lineUnitCost(line))}
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Markup %</span>
          {canEdit ? (
            <input
              type="number"
              min="0"
              step="0.5"
              value={line.markup_pct}
              onChange={e => onChange(line.id, 'markup_pct', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">{line.markup_pct}%</span>
          )}
        </label>
      </div>

      {/* Labor / material / sub — the buckets the unit cost above adds up to */}
      <div className={`grid grid-cols-3 gap-2 mt-2${isHidden ? ' opacity-50' : ''}`}>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Labor $</span>
          {canEdit ? (
            <input
              type="number" min="0" step="0.01"
              value={line.labor_cost ?? ''}
              placeholder="—"
              onChange={e => onChange(line.id, 'labor_cost', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums placeholder-gray-300"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">
              {line.labor_cost === null ? '—' : fmt(line.labor_cost)}
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Matl $</span>
          {canEdit ? (
            <input
              type="number" min="0" step="0.01"
              value={line.material_cost ?? ''}
              placeholder="—"
              onChange={e => onChange(line.id, 'material_cost', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums placeholder-gray-300"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">
              {line.material_cost === null ? '—' : fmt(line.material_cost)}
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sub $</span>
          {canEdit ? (
            <input
              type="number" min="0" step="0.01"
              value={line.sub_cost ?? ''}
              placeholder="—"
              onChange={e => onChange(line.id, 'sub_cost', e.target.value)}
              className="w-full text-sm text-navy-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-gold-400 tabular-nums placeholder-gray-300"
            />
          ) : (
            <span className="block text-sm text-navy-700 tabular-nums py-1.5">
              {line.sub_cost === null ? '—' : fmt(line.sub_cost)}
            </span>
          )}
        </label>
      </div>

      {/* Totals + notes toggle */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Notes
        </button>
        <p className={`text-xs tabular-nums${isHidden ? ' opacity-50' : ''}`}>
          <span className="text-gray-400">cost {fmt(builderCost)} → </span>
          <span className="text-sm font-semibold text-navy-900">{fmt(total)}</span>
        </p>
      </div>

      {/* Expanded notes + price lookup */}
      {expanded && (
        <div className="mt-2 space-y-2">
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

          {canEdit && <CatalogPriceSection line={line} onChange={onChange} />}
          {canEdit && <PriceLookupSection line={line} onChange={onChange} />}
        </div>
      )}
    </div>
  )
}
