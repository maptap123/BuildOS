'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Sparkles, Square, Trash2, Check, AlertTriangle } from 'lucide-react'
import { useFixerChat, formatElapsed } from '@/hooks/useFixerChat'
import type { EstimateLineProposal } from '@/types'

/**
 * Fixer, inside the estimate
 * ==========================
 * The floating panel is a generalist that happens to be reachable from here. This one
 * only estimates: it knows which estimate is open without being told, keeps its own
 * thread per estimate, and hands back priced lines for review rather than writing them
 * where nobody sees them.
 *
 * The review step is why this exists. Before each turn it opens a proposal session
 * (/api/estimate-lines/proposals/session), which makes add_estimate_lines stage into
 * estimate_line_proposals instead of estimate_lines. Nothing lands until the estimator
 * checks it off.
 *
 * Line names are not Fixer's to write. Every proposed name is copied from the past line
 * or cost code it cites; anything it could not source arrives blank and unpriced, for a
 * person to fill in here before it can be approved.
 */

interface Props {
  estimateId: string
  scopeText: string
  canCreate: boolean
  isLocked: boolean
  /** Text the "Ask Fixer" button dropped into the composer; cleared once consumed. */
  seedDraft: string | null
  onSeedConsumed: () => void
  /** Reload the line table — Fixer's approved lines land server-side. */
  onLinesChanged: () => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/**
 * One big "price the whole house" turn is what blew the old timeout. These are the
 * steps it breaks into, so each round-trip stays small enough to come back.
 */
const ESTIMATING_CHIPS = [
  'Find comparable jobs',
  'Price one phase',
  'Check my markup',
  "What did we charge for this before?",
]

function proposalTotal(p: EstimateLineProposal) {
  return p.quantity * p.unit_cost * (1 + p.markup_pct / 100)
}

function isUnnamed(p: EstimateLineProposal) {
  return p.name_status === 'unsourced' || !p.description?.trim()
}

export function EstimateFixerPanel({
  estimateId,
  scopeText,
  canCreate,
  isLocked,
  seedDraft,
  onSeedConsumed,
  onLinesChanged,
}: Props) {
  const [proposals, setProposals] = useState<EstimateLineProposal[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  /** In-progress edits for the lines Fixer could not name. */
  const [drafts, setDrafts] = useState<Record<string, { description: string; unit_cost: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const storageKey = `fixer:estimate:${estimateId}`

  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch(`/api/estimate-lines/proposals?estimate_id=${estimateId}`)
      if (!res.ok) return
      const rows: EstimateLineProposal[] = await res.json()
      setProposals(rows)
      // Sourced lines arrive checked — the common case is "these look right, add them".
      // Unnamed ones cannot be checked until someone names them.
      setSelected(new Set(rows.filter(r => !isUnnamed(r)).map(r => r.id)))
      setDrafts(Object.fromEntries(
        rows.filter(isUnnamed).map(r => [r.id, {
          description: r.suggested_description ?? '',
          unit_cost: r.unit_cost ? String(r.unit_cost) : '',
        }])
      ))
    } catch {
      // A failed refresh just means the review list is stale; the chat still works.
    }
  }, [estimateId])

  const handleTurnComplete = useCallback(() => {
    void loadProposals()
    onLinesChanged()
  }, [loadProposals, onLinesChanged])

  const {
    messages, input, setInput, loading, elapsedMs, send, stop,
  } = useFixerChat({
    estimateId,
    initialConversationId:
      typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) ?? undefined : undefined,
    onTurnComplete: handleTurnComplete,
    onConversationId: useCallback((id: string) => {
      try { sessionStorage.setItem(storageKey, id) } catch { /* private mode */ }
    }, [storageKey]),
  })

  // Anything left over from a previous visit is still waiting to be reviewed.
  useEffect(() => { void loadProposals() }, [loadProposals])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, proposals])

  useEffect(() => {
    if (!seedDraft) return
    setInput(seedDraft)
    onSeedConsumed()
    setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 100)
  }, [seedDraft, setInput, onSeedConsumed])

  /**
   * Opening the session first is what makes this panel's turns reviewable. If it fails
   * the turn still runs — Fixer just writes directly, the way the floating panel does.
   */
  const sendWithReview = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setPanelError(null)
    try {
      await fetch('/api/estimate-lines/proposals/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimate_id: estimateId }),
      })
    } catch {
      // Non-fatal by design; see above.
    }
    await send(text)
  }, [send, loading, estimateId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveName(p: EstimateLineProposal) {
    const draft = drafts[p.id]
    if (!draft?.description.trim()) return
    setSavingId(p.id)
    setPanelError(null)
    try {
      const res = await fetch('/api/estimate-lines/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: p.id,
          description: draft.description.trim(),
          unit_cost: Number(draft.unit_cost) || 0,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Could not save that name')
      }
      await loadProposals()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Could not save that name')
    } finally {
      setSavingId(null)
    }
  }

  async function applySelected() {
    const ids = proposals.filter(p => selected.has(p.id) && !isUnnamed(p)).map(p => p.id)
    if (ids.length === 0) return
    setApplying(true)
    setPanelError(null)
    try {
      const res = await fetch('/api/estimate-lines/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_ids: ids }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Could not add those lines')
      }
      onLinesChanged()
      await loadProposals()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Could not add those lines')
    } finally {
      setApplying(false)
    }
  }

  async function discardAll() {
    setApplying(true)
    setPanelError(null)
    try {
      await fetch('/api/estimate-lines/proposals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimate_id: estimateId }),
      })
      await loadProposals()
    } catch {
      setPanelError('Could not discard those lines')
    } finally {
      setApplying(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendWithReview(input)
    }
  }

  const selectedTotal = proposals
    .filter(p => selected.has(p.id) && !isUnnamed(p))
    .reduce((sum, p) => sum + proposalTotal(p), 0)
  const unnamedCount = proposals.filter(isUnnamed).length

  const disabled = !canCreate || isLocked

  return (
    <div className="bg-white rounded-xl border border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="w-7 h-7 rounded-full bg-navy-900 flex items-center justify-center shrink-0">
          <Bot size={14} className="text-gold-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-navy-900 text-sm leading-none">Fixer</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Prices from past JDC jobs</p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[220px] max-h-[420px]">
        {messages.length === 0 && (
          <div className="text-center py-6 px-2">
            <Sparkles size={22} className="text-gold-400 mx-auto" />
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {scopeText.trim()
                ? 'Ask me to price this scope from comparable past jobs. I’ll show you what I found before anything lands on the estimate.'
                : 'Write the scope notes above, then ask me to price them from comparable past jobs.'}
            </p>
            <p className="text-[10px] text-gray-400 mt-2">
              Line names come from your past estimates and cost book, never from me.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-5 h-5 rounded-full bg-navy-900 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={10} className="text-gold-400" />
              </div>
            )}
            <div
              className={`
                max-w-[85%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap
                ${msg.role === 'user'
                  ? 'bg-navy-900 text-white rounded-br-sm'
                  : msg.failed
                    ? 'bg-red-50 text-red-800 rounded-bl-sm'
                    : 'bg-gray-100 text-navy-900 rounded-bl-sm'
                }
              `}
            >
              {msg.content || (msg.streaming && (
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Loader2 size={11} className="animate-spin" />
                  <span>
                    {elapsedMs >= 5000
                      ? `Pricing — ${formatElapsed(elapsedMs)}`
                      : 'Thinking…'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* ── Proposed lines, waiting on you ── */}
        {proposals.length > 0 && (
          <div className="border border-gold-300 bg-gold-50/60 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gold-200 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-navy-900">
                {proposals.length} line{proposals.length === 1 ? '' : 's'} proposed
              </p>
              <p className="text-[11px] font-semibold text-navy-900">{fmt(selectedTotal)}</p>
            </div>

            {unnamedCount > 0 && (
              <p className="px-3 py-1.5 text-[10px] text-red-700 bg-red-50 border-b border-red-200 flex items-start gap-1.5">
                <AlertTriangle size={11} className="shrink-0 mt-px" />
                <span>
                  {unnamedCount === 1 ? 'One line' : `${unnamedCount} lines`} matched nothing in your
                  past estimates or cost book. Name and price {unnamedCount === 1 ? 'it' : 'them'} to use
                  {unnamedCount === 1 ? ' it' : ' them'} — Fixer does not make names up.
                </span>
              </p>
            )}

            <ul className="divide-y divide-gold-200/70 max-h-72 overflow-y-auto">
              {proposals.map(p => {
                const unnamed = isUnnamed(p)

                if (unnamed) {
                  const draft = drafts[p.id] ?? { description: '', unit_cost: '' }
                  return (
                    <li key={p.id} className="px-3 py-2 bg-red-50/60">
                      <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Needs a name
                      </p>
                      {p.suggested_description && (
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                          Fixer suggested “{p.suggested_description}” — check it against your own
                          wording before using it.
                        </p>
                      )}
                      <input
                        value={draft.description}
                        onChange={e => setDrafts(d => ({ ...d, [p.id]: { ...draft, description: e.target.value } }))}
                        placeholder="Line name"
                        className="w-full mt-1.5 text-[11px] text-navy-900 bg-white border border-red-200 rounded px-2 py-1 focus:outline-none focus:border-red-400"
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {p.quantity} {p.uom} ×
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft.unit_cost}
                          onChange={e => setDrafts(d => ({ ...d, [p.id]: { ...draft, unit_cost: e.target.value } }))}
                          placeholder="Unit cost"
                          className="flex-1 min-w-0 text-[11px] text-navy-900 bg-white border border-red-200 rounded px-2 py-1 focus:outline-none focus:border-red-400 tabular-nums"
                        />
                        <button
                          onClick={() => saveName(p)}
                          disabled={!draft.description.trim() || savingId === p.id || disabled}
                          className="shrink-0 text-[10px] font-semibold bg-navy-900 hover:bg-navy-800 text-white px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {savingId === p.id ? <Loader2 size={10} className="animate-spin" /> : 'Save'}
                        </button>
                      </div>
                    </li>
                  )
                }

                return (
                  <li key={p.id} className="px-3 py-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="mt-0.5 shrink-0 accent-gold-500"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-medium text-navy-900 leading-snug">
                          {p.description}
                        </span>
                        <span className="block text-[10px] text-gray-500 mt-0.5">
                          {p.quantity} {p.uom} × {fmt(p.unit_cost)}
                          {p.markup_pct > 0 && ` + ${p.markup_pct}%`}
                          {' = '}
                          <span className="font-medium text-navy-700">{fmt(proposalTotal(p))}</span>
                        </span>
                        {/* How the unit cost splits — the estimate carries it through. */}
                        {(p.labor_cost !== null || p.material_cost !== null || p.sub_cost !== null) && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            {[
                              p.labor_cost !== null && `labor ${fmt(p.labor_cost)}`,
                              p.material_cost !== null && `matl ${fmt(p.material_cost)}`,
                              p.sub_cost !== null && `sub ${fmt(p.sub_cost)}`,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {/* The whole point of the review step: where the name and number came from. */}
                        <span className="block text-[10px] text-gray-400 mt-0.5">
                          {p.comp_label
                            ? `from ${p.comp_label}`
                            : p.cost_code
                              ? `from cost code ${p.cost_code}`
                              : 'named by hand'}
                        </span>
                        {p.ai_rationale && (
                          <span className="block text-[10px] text-gray-400 italic mt-0.5 leading-snug">
                            {p.ai_rationale}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="px-3 py-2 border-t border-gold-200 flex items-center gap-2">
              <button
                onClick={applySelected}
                disabled={applying || selected.size === 0 || disabled}
                className="flex items-center gap-1 text-[11px] font-semibold bg-gold-500 hover:bg-gold-600 text-navy-900 px-2.5 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {applying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Add checked ({selected.size})
              </button>
              <button
                onClick={discardAll}
                disabled={applying}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              >
                <Trash2 size={11} />
                Discard
              </button>
            </div>
          </div>
        )}

        {panelError && (
          <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            {panelError}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Step chips */}
      <div className="shrink-0 flex gap-1.5 overflow-x-auto px-3 pt-2 scrollbar-none">
        {ESTIMATING_CHIPS.map(chip => (
          <button
            key={chip}
            onClick={() => void sendWithReview(chip)}
            disabled={loading || disabled}
            className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-full border border-gold-300 text-navy-700 bg-gold-50 hover:bg-gold-100 disabled:opacity-40 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 px-3 pb-3 pt-2">
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-2.5 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLocked ? 'Estimate is locked' : 'Ask Fixer to price something…'}
            rows={2}
            disabled={loading || disabled}
            className="flex-1 bg-transparent text-xs text-navy-900 placeholder-gray-400 resize-none outline-none max-h-40 leading-5 py-0.5 disabled:opacity-50"
          />
          {loading ? (
            <button
              onClick={stop}
              className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 text-navy-900 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Stop Fixer"
              title="Stop"
            >
              <Square size={11} />
            </button>
          ) : (
            <button
              onClick={() => void sendWithReview(input)}
              disabled={!input.trim() || disabled}
              className="w-7 h-7 rounded-lg bg-gold-500 hover:bg-gold-600 text-navy-900 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send to Fixer"
            >
              <Send size={12} />
            </button>
          )}
        </div>
        {loading && (
          <p className="text-[10px] text-gray-400 text-center mt-1.5">
            Working — {formatElapsed(elapsedMs)}. Pricing a full scope can take a few minutes.
          </p>
        )}
      </div>
    </div>
  )
}
