'use client'

import { useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Save,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  ClipboardList,
  Printer,
  ExternalLink,
  Send,
  CheckCircle2,
  X,
  Layers,
} from 'lucide-react'
import { CostCatalogSearch } from './CostCatalogSearch'
import { EstimateLineRow } from './EstimateLineRow'
import { EstimateTotals } from './EstimateTotals'
import type { Lead, Estimate, EstimateLine, CostCatalogItem, EstimateStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  lead: Lead
  initialEstimates: Estimate[]
  initialLines: EstimateLine[]
  permissions: Permissions
}

const STATUS_STYLES: Record<EstimateStatus, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  voided:   'bg-gray-50 text-gray-400',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function lineTotal(l: EstimateLine) {
  return l.quantity * l.unit_cost * (1 + l.markup_pct / 100)
}

function groupByPhase(lines: EstimateLine[]): Map<string, EstimateLine[]> {
  const map = new Map<string, EstimateLine[]>()
  for (const l of lines) {
    const key = l.phase ?? 'Unassigned'
    const arr = map.get(key) ?? []
    arr.push(l)
    map.set(key, arr)
  }
  return map
}

// ── Assembly definitions ───────────────────────────────────────────────────
interface AssemblyLine {
  description: string
  phase: string
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
}

interface Assembly {
  id: string
  name: string
  description: string
  lines: AssemblyLine[]
}

const ASSEMBLIES: Assembly[] = [
  {
    id: 'bathroom-remodel',
    name: 'Standard Bathroom Remodel',
    description: 'Demo, tile work, fixture install, plumbing rough',
    lines: [
      { description: 'Demolition & Disposal', phase: 'Demo', uom: 'EA', quantity: 1, unit_cost: 850, markup_pct: 15 },
      { description: 'Tile Work — Floor & Shower Surround', phase: 'Finishes', uom: 'SF', quantity: 80, unit_cost: 12, markup_pct: 20 },
      { description: 'Fixture Installation (toilet, vanity, shower)', phase: 'Finishes', uom: 'EA', quantity: 1, unit_cost: 1200, markup_pct: 15 },
      { description: 'Plumbing Rough-In', phase: 'Plumbing', uom: 'HR', quantity: 8, unit_cost: 95, markup_pct: 15 },
    ],
  },
  {
    id: 'interior-door',
    name: 'Interior Door Install',
    description: 'Pre-hung door with hardware and labor',
    lines: [
      { description: 'Pre-Hung Interior Door + Hardware', phase: 'Finishes', uom: 'EA', quantity: 1, unit_cost: 185, markup_pct: 20 },
      { description: 'Door Installation Labor', phase: 'Finishes', uom: 'HR', quantity: 2, unit_cost: 75, markup_pct: 15 },
    ],
  },
  {
    id: 'deck-200',
    name: 'Deck Construction — 200 sqft',
    description: 'Framing, decking boards, and finish work',
    lines: [
      { description: 'Deck Framing — Posts, Beams, Joists', phase: 'Framing', uom: 'SF', quantity: 200, unit_cost: 8, markup_pct: 15 },
      { description: 'Composite Decking Boards', phase: 'Finishes', uom: 'SF', quantity: 200, unit_cost: 14, markup_pct: 20 },
      { description: 'Railing, Trim & Finish', phase: 'Finishes', uom: 'LF', quantity: 60, unit_cost: 35, markup_pct: 20 },
    ],
  },
  {
    id: 'kitchen-cabinets',
    name: 'Kitchen Cabinet Install',
    description: 'Semi-custom cabinets and installation labor',
    lines: [
      { description: 'Semi-Custom Kitchen Cabinets', phase: 'Finishes', uom: 'EA', quantity: 1, unit_cost: 4500, markup_pct: 20 },
      { description: 'Cabinet Installation Labor', phase: 'Finishes', uom: 'HR', quantity: 16, unit_cost: 75, markup_pct: 15 },
    ],
  },
  {
    id: 'exterior-paint',
    name: 'Exterior Paint — 2000 sqft',
    description: 'Two-coat exterior paint system with labor',
    lines: [
      { description: 'Exterior Paint & Primer Materials', phase: 'Exterior', uom: 'SF', quantity: 2000, unit_cost: 0.85, markup_pct: 20 },
      { description: 'Exterior Painting Labor', phase: 'Exterior', uom: 'HR', quantity: 40, unit_cost: 60, markup_pct: 15 },
    ],
  },
]

export function EstimateBuilderClient({
  lead,
  initialEstimates,
  initialLines,
  permissions,
}: Props) {
  const router = useRouter()

  const [estimates, setEstimates]             = useState<Estimate[]>(initialEstimates)
  const [activeEstimate, setActiveEstimate]   = useState<Estimate | null>(initialEstimates[0] ?? null)
  const [lines, setLines]                     = useState<EstimateLine[]>(initialLines)
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [successMsg, setSuccessMsg]           = useState<string | null>(null)
  const [creating, setCreating]               = useState(false)
  const [showCatalog, setShowCatalog]         = useState(true)
  const [dirtyLines, setDirtyLines]           = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  // Scope state
  const [scopeText, setScopeText]             = useState<string>(initialEstimates[0]?.scope_text ?? '')
  const [scopeSaving, setScopeSaving]         = useState(false)

  // Assembly modal
  const [showAssemblies, setShowAssemblies]   = useState(false)
  const [addingAssembly, setAddingAssembly]   = useState<string | null>(null)

  // ── Create a new estimate ──────────────────────────────────────
  async function createEstimate() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/estimates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: lead.id }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Failed to create estimate')
      }
      const est: Estimate = await res.json()
      setEstimates(prev => [est, ...prev])
      setActiveEstimate(est)
      setLines([])
      setDirtyLines(new Set())
      setScopeText(est.scope_text ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  // ── Switch active estimate ─────────────────────────────────────
  async function switchEstimate(est: Estimate) {
    setActiveEstimate(est)
    setScopeText(est.scope_text ?? '')
    setError(null)
    try {
      const res = await fetch(`/api/estimate-lines?estimate_id=${est.id}`)
      if (!res.ok) throw new Error('Failed to load lines')
      setLines(await res.json())
      setDirtyLines(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load estimate lines')
    }
  }

  // ── Add line from cost catalog ─────────────────────────────────
  async function addCatalogItem(item: CostCatalogItem) {
    if (!activeEstimate) return
    setError(null)
    try {
      const res = await fetch('/api/estimate-lines', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          estimate_id:  activeEstimate.id,
          lead_id:      lead.id,
          cost_item_id: item.id,
          description:  item.title,
          phase:        item.phase ?? item.division_name,
          cost_code:    item.cost_code,
          uom:          item.uom,
          quantity:     1,
          unit_cost:    item.unit_cost,
          markup_pct:   activeEstimate.markup_pct ?? 0,
          sort_order:   lines.length,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Failed to add line')
      }
      const newLine: EstimateLine = await res.json()
      setLines(prev => [...prev, newLine])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add item')
    }
  }

  // ── Add blank line manually ────────────────────────────────────
  async function addBlankLine() {
    if (!activeEstimate) return
    setError(null)
    try {
      const res = await fetch('/api/estimate-lines', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          estimate_id: activeEstimate.id,
          lead_id:     lead.id,
          description: 'New line item',
          quantity:    1,
          unit_cost:   0,
          markup_pct:  activeEstimate.markup_pct ?? 0,
          sort_order:  lines.length,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Failed to add line')
      }
      const newLine: EstimateLine = await res.json()
      setLines(prev => [...prev, newLine])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add line')
    }
  }

  // ── Add assembly ───────────────────────────────────────────────
  async function addAssembly(assembly: Assembly) {
    if (!activeEstimate) return
    setAddingAssembly(assembly.id)
    setError(null)
    try {
      const results = await Promise.all(
        assembly.lines.map((al, i) =>
          fetch('/api/estimate-lines', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              estimate_id: activeEstimate.id,
              lead_id:     lead.id,
              description: al.description,
              phase:       al.phase,
              uom:         al.uom,
              quantity:    al.quantity,
              unit_cost:   al.unit_cost,
              markup_pct:  al.markup_pct,
              sort_order:  lines.length + i,
            }),
          }).then(async r => {
              if (!r.ok) throw new Error(`Line POST failed: ${r.status}`)
              return r.json() as Promise<EstimateLine>
            })
        )
      )
      setLines(prev => [...prev, ...results])
      setShowAssemblies(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add assembly')
    } finally {
      setAddingAssembly(null)
    }
  }

  // ── Local field change (queues dirty) ─────────────────────────
  const handleLineChange = useCallback(
    (id: string, field: keyof EstimateLine, value: string | number) => {
      setLines(prev =>
        prev.map(l => l.id === id ? { ...l, [field]: value } : l)
      )
      setDirtyLines(prev => new Set(prev).add(id))
    },
    []
  )

  // ── Delete line ────────────────────────────────────────────────
  async function deleteLine(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/estimate-lines?id=${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete')
      setLines(prev => prev.filter(l => l.id !== id))
      setDirtyLines(prev => { const s = new Set(prev); s.delete(id); return s })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete line')
    }
  }

  // ── Save all dirty lines ───────────────────────────────────────
  async function saveEstimate() {
    if (!activeEstimate) return
    setSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const toSave = lines.filter(l => dirtyLines.has(l.id))
      await Promise.all(
        toSave.map(l =>
          fetch(`/api/estimate-lines?id=${l.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              description: l.description,
              phase:       l.phase,
              cost_code:   l.cost_code,
              uom:         l.uom,
              quantity:    l.quantity,
              unit_cost:   l.unit_cost,
              markup_pct:  l.markup_pct,
              sort_order:  l.sort_order,
              notes:       l.notes,
            }),
          })
        )
      )
      setDirtyLines(new Set())
      setSuccessMsg('Estimate saved')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Patch estimate header field ────────────────────────────────
  async function patchEstimate(updates: Partial<Estimate>) {
    if (!activeEstimate) return
    const res = await fetch(`/api/estimates/${activeEstimate.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    })
    const updated = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(updated.error ?? 'Failed to update estimate')
    setActiveEstimate(updated)
    setEstimates(prev => prev.map(est => est.id === updated.id ? updated : est))
    return updated as Estimate
  }

  // ── Save scope text ────────────────────────────────────────────
  async function saveScope() {
    if (!activeEstimate) return
    setScopeSaving(true)
    setError(null)
    try {
      await patchEstimate({ scope_text: scopeText || null } as Partial<Estimate>)
      setSuccessMsg('Scope saved')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save scope')
    } finally {
      setScopeSaving(false)
    }
  }

  // ── Confirm / unconfirm scope ──────────────────────────────────
  async function toggleScopeConfirmed() {
    if (!activeEstimate) return
    setScopeSaving(true)
    setError(null)
    try {
      await patchEstimate({ scope_confirmed: !activeEstimate.scope_confirmed } as Partial<Estimate>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update scope confirmation')
    } finally {
      setScopeSaving(false)
    }
  }

  async function markProposalSent() {
    if (!activeEstimate) return
    setSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await patchEstimate({ status: 'sent' })
      setSuccessMsg('Proposal marked sent')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark proposal sent')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle phase collapse ──────────────────────────────────────
  function togglePhase(phase: string) {
    setCollapsedPhases(prev => {
      const s = new Set(prev)
      if (s.has(phase)) s.delete(phase); else s.add(phase)
      return s
    })
  }

  const groupedLines = groupByPhase(lines)
  const grandTotal   = lines.reduce((s, l) => s + lineTotal(l), 0)
  const hasDirty     = dirtyLines.size > 0

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <button
          onClick={() => router.push(`/leads/${lead.id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-900 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          Back to Lead
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-navy-900 text-2xl leading-tight">
              Estimate Builder
            </h1>
            <p className="text-sm text-gray-500 mt-1">{lead.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {permissions.can_create && (
              <button
                onClick={createEstimate}
                disabled={creating}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                New Estimate
              </button>
            )}
            {activeEstimate && hasDirty && (
              <button
                onClick={saveEstimate}
                disabled={saving}
                className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Estimate'}
              </button>
            )}
            {activeEstimate && !hasDirty && lines.length > 0 && (
              <button
                onClick={saveEstimate}
                disabled={saving}
                className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Save size={14} />
                Save
              </button>
            )}
            {activeEstimate && (
              <>
                <a
                  href={`/leads/${lead.id}/proposals/${activeEstimate.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                >
                  <Printer size={14} />
                  Print / PDF
                </a>
                {activeEstimate.status === 'draft' && lines.length > 0 && permissions.can_edit && (
                  <button
                    onClick={markProposalSent}
                    disabled={saving}
                    className="flex items-center gap-1.5 border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Send
                  </button>
                )}
                {activeEstimate.public_token && activeEstimate.status === 'sent' && (
                  <button
                    onClick={() => window.open(`/proposals/${activeEstimate.public_token}`, '_blank')}
                    className="flex items-center gap-1.5 border border-green-200 text-green-700 hover:bg-green-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    <ExternalLink size={14} />
                    Client Link
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          {successMsg}
        </div>
      )}

      {/* Estimate version tabs */}
      {estimates.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {estimates.map(est => (
            <button
              key={est.id}
              onClick={() => switchEstimate(est)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeEstimate?.id === est.id
                  ? 'bg-navy-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <FileText size={11} />
              {est.title ?? `Estimate v${est.version}`}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[est.status as EstimateStatus]}`}>
                {est.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Scope section */}
      {activeEstimate && (
        <div className="bg-white rounded-xl border border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-navy-800">Scope Notes</h3>
              {activeEstimate.status === 'sent' && !activeEstimate.scope_confirmed && (
                <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  Scope not confirmed
                </span>
              )}
              {activeEstimate.scope_confirmed && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-green-700">
                  <CheckCircle2 size={12} />
                  Confirmed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {permissions.can_edit && (
                <>
                  <button
                    onClick={saveScope}
                    disabled={scopeSaving}
                    className="text-xs text-gray-500 hover:text-navy-800 font-medium transition-colors disabled:opacity-50"
                  >
                    {scopeSaving ? <Loader2 size={12} className="animate-spin inline" /> : 'Save'}
                  </button>
                  <button
                    onClick={toggleScopeConfirmed}
                    disabled={scopeSaving}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      activeEstimate.scope_confirmed
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <CheckCircle2 size={12} />
                    {activeEstimate.scope_confirmed ? 'Scope Confirmed' : 'Confirm Scope'}
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={scopeText}
            onChange={e => setScopeText(e.target.value)}
            disabled={!permissions.can_edit}
            placeholder="Describe the scope of work for this estimate…"
            rows={3}
            className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gold-400 resize-none disabled:opacity-60"
          />
        </div>
      )}

      {/* No estimate yet */}
      {estimates.length === 0 && (
        <div className="bg-white rounded-xl border border-border flex flex-col items-center justify-center py-16 gap-3">
          <ClipboardList size={36} className="text-gray-200" />
          <p className="text-gray-400 text-sm">No estimates yet for this lead</p>
          {permissions.can_create && (
            <button
              onClick={createEstimate}
              disabled={creating}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors mt-1"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create First Estimate
            </button>
          )}
        </div>
      )}

      {/* Main estimate layout */}
      {activeEstimate && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Cost catalog */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowCatalog(v => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900 transition-colors"
              >
                {showCatalog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Cost Catalog
              </button>
              <div className="flex items-center gap-2">
                {permissions.can_create && (
                  <button
                    onClick={() => setShowAssemblies(true)}
                    className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium transition-colors"
                  >
                    <Layers size={12} />
                    Assemblies
                  </button>
                )}
                {permissions.can_create && (
                  <button
                    onClick={addBlankLine}
                    className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700 font-medium transition-colors"
                  >
                    <Plus size={12} />
                    Blank line
                  </button>
                )}
              </div>
            </div>
            {showCatalog && (
              <CostCatalogSearch onSelect={permissions.can_create ? addCatalogItem : () => {}} />
            )}
            <EstimateTotals lines={lines} />
          </div>

          {/* Right: Line items table */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-display font-semibold text-navy-900 text-base">
                    {activeEstimate.title ?? `Estimate v${activeEstimate.version}`}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {lines.length} line{lines.length !== 1 ? 's' : ''} · Total {fmt(grandTotal)}
                  </p>
                </div>
                {hasDirty && (
                  <span className="text-[10px] text-gold-600 font-medium bg-gold-50 px-2 py-1 rounded-full">
                    Unsaved changes
                  </span>
                )}
              </div>

              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
                  <FileText size={28} className="text-gray-200" />
                  No line items yet
                  <p className="text-xs text-gray-300">Search the cost catalog on the left to add items</p>
                  {permissions.can_create && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={addBlankLine}
                        className="text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
                      >
                        Add a blank line →
                      </button>
                      <span className="text-gray-200">or</span>
                      <button
                        onClick={() => setShowAssemblies(true)}
                        className="flex items-center gap-1 text-navy-600 hover:text-navy-800 font-medium text-sm transition-colors"
                      >
                        <Layers size={14} />
                        Add assembly
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                        <th className="pl-3 pr-1 py-2.5 w-6" />
                        <th className="px-2 py-2.5 text-left">Description</th>
                        <th className="px-2 py-2.5 text-left w-28 hidden md:table-cell">Phase</th>
                        <th className="px-2 py-2.5 text-center w-16 hidden md:table-cell">UOM</th>
                        <th className="px-2 py-2.5 text-right w-20">Qty</th>
                        <th className="px-2 py-2.5 text-right w-28">Unit Cost</th>
                        <th className="px-2 py-2.5 text-right w-20 hidden md:table-cell">Markup</th>
                        <th className="px-2 py-2.5 text-right w-28">Total</th>
                        <th className="pr-3 pl-1 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(groupedLines.entries()).map(([phase, phaseLines]) => {
                        const phaseTotal  = phaseLines.reduce((s, l) => s + lineTotal(l), 0)
                        const isCollapsed = collapsedPhases.has(phase)
                        return (
                          <Fragment key={phase}>
                            <tr
                              className="bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => togglePhase(phase)}
                            >
                              <td className="pl-3 pr-1 py-2">
                                {isCollapsed
                                  ? <ChevronRight size={12} className="text-gray-400" />
                                  : <ChevronDown  size={12} className="text-gray-400" />
                                }
                              </td>
                              <td colSpan={6} className="px-2 py-2">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                  {phase}
                                </span>
                                <span className="text-[10px] text-gray-400 ml-2">
                                  {phaseLines.length} item{phaseLines.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right">
                                <span className="text-xs font-semibold text-navy-700 tabular-nums">
                                  {fmt(phaseTotal)}
                                </span>
                              </td>
                              <td className="pr-3 pl-1 py-2" />
                            </tr>

                            {!isCollapsed && phaseLines.map(line => (
                              <EstimateLineRow
                                key={line.id}
                                line={line}
                                canEdit={permissions.can_edit}
                                canDelete={permissions.can_delete}
                                onChange={handleLineChange}
                                onDelete={deleteLine}
                              />
                            ))}
                          </Fragment>
                        )
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={7} className="px-5 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide">
                          Grand Total
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="font-bold text-navy-900 tabular-nums">{fmt(grandTotal)}</span>
                        </td>
                        <td className="pr-3 pl-1 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Footer action bar */}
              {activeEstimate && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                  {permissions.can_create && (
                    <button
                      onClick={addBlankLine}
                      className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium transition-colors"
                    >
                      <Plus size={12} />
                      Add blank line
                    </button>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    {hasDirty && (
                      <button
                        onClick={saveEstimate}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {saving ? 'Saving…' : 'Save Estimate'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assemblies modal */}
      {showAssemblies && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-display font-bold text-navy-900 text-lg">Add Assembly</h2>
                <p className="text-xs text-gray-400 mt-0.5">Add a preset group of line items at once</p>
              </div>
              <button
                onClick={() => setShowAssemblies(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3">
              {ASSEMBLIES.map(assembly => (
                <div
                  key={assembly.id}
                  className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 hover:border-gold-300 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-800 text-sm">{assembly.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{assembly.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {assembly.lines.map((al, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"
                        >
                          {al.description}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-gray-400 font-medium">
                      {assembly.lines.length} line{assembly.lines.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => addAssembly(assembly)}
                      disabled={addingAssembly !== null}
                      className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {addingAssembly === assembly.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} />
                      )}
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
