'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Check } from 'lucide-react'
import { normalizeCostCode } from '@/lib/estimates/costCodes'
import type { SelectionsBoard, SelectionEstimateLine } from '@/types'
import { Sheet, fmtMoney, inputClass, labelClass, ROOM_SUGGESTIONS } from './Sheet'

type Mode = 'link' | 'new' | 'change_order' | 'none'

type CatalogItem = { id: string; cost_code: string; title: string }

/**
 * New selection: name it, pick its cost code, and the sheet asks the allowance question
 * that code calls for — link to the allowance the estimate already gave it, add one to an
 * estimate line that has none (internal tracking, the client signs nothing), or, for a
 * code outside the contract, add one, share one, or bill the whole price as an add.
 */
export function NewSelectionSheet({
  jobId,
  board,
  onClose,
  onCreated,
}: {
  jobId: string
  board: SelectionsBoard
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [query, setQuery] = useState('')
  const [costCode, setCostCode] = useState<string | null>(null)
  const [codeLabel, setCodeLabel] = useState('')
  const [pickedLine, setPickedLine] = useState<SelectionEstimateLine | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [mode, setMode] = useState<Mode | null>(null)
  const [linkId, setLinkId] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Cost book search, debounced; the estimate's own lines are matched locally.
  useEffect(() => {
    const q = query.trim()
    if (costCode || q.length < 2) { setCatalog([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cost-catalog?q=${encodeURIComponent(q)}&limit=12`)
      if (res.ok) setCatalog(await res.json())
    }, 250)
    return () => clearTimeout(t)
  }, [query, costCode])

  const estimateMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const lines = board.estimateLines.filter(l => l.cost_code)
    if (!q) return lines.slice(0, 8)
    return lines
      .filter(l => l.description.toLowerCase().includes(q) || (l.cost_code ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, board.estimateLines])

  const codeKey = normalizeCostCode(costCode)
  const matchingAllowances = codeKey
    ? board.allowances.filter(a => normalizeCostCode(a.cost_code) === codeKey)
    : []
  const estimateLine = pickedLine ??
    (codeKey ? board.estimateLines.find(l => normalizeCostCode(l.cost_code) === codeKey) ?? null : null)
  const situation: 'existing' | 'estimate_no_allowance' | 'not_on_estimate' | null =
    costCode === null ? null
      : matchingAllowances.length ? 'existing'
      : estimateLine ? 'estimate_no_allowance'
      : 'not_on_estimate'

  function pickCode(code: string, label: string, line: SelectionEstimateLine | null, suggestedTitle: string) {
    setCostCode(code)
    setCodeLabel(label)
    setPickedLine(line)
    setQuery('')
    if (!title.trim()) setTitle(suggestedTitle)
    const key = normalizeCostCode(code)
    const match = board.allowances.find(a => normalizeCostCode(a.cost_code) === key)
    if (match) { setMode('link'); setLinkId(match.id) } else { setMode('new'); setLinkId('') }
    setAmount('')
  }

  function clearCode() {
    setCostCode(null); setCodeLabel(''); setPickedLine(null); setMode(null); setLinkId('')
  }

  function skipCode() {
    setCostCode(''); setCodeLabel('No cost code'); setPickedLine(null); setMode('none')
  }

  async function save() {
    setError('')
    if (!title.trim()) { setError('Give the selection a name'); return }
    if (costCode === null) { setError('Pick a cost code, or choose "No cost code"'); return }
    let allowance: Record<string, unknown> = { mode: 'none' }
    if (mode === 'link') {
      if (!linkId) { setError('Choose the allowance to draw from'); return }
      allowance = { mode: 'link', allowance_id: linkId }
    } else if (mode === 'new') {
      const n = Number(amount.replace(/[$,]/g, ''))
      if (!amount.trim() || !Number.isFinite(n) || n < 0) { setError('Enter the allowance amount'); return }
      allowance = {
        mode: 'new',
        amount: n,
        estimate_line_id: situation === 'estimate_no_allowance' ? estimateLine?.id ?? null : null,
      }
    } else if (mode === 'change_order') {
      allowance = { mode: 'change_order' }
    }

    setSaving(true)
    const res = await fetch(`/api/jobs/${jobId}/selections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, location, cost_code: costCode || null, allowance }),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not save')
      return
    }
    onCreated()
  }

  const shownCode = costCode ? costCode.replace(/\.+$/, '') : ''

  return (
    <Sheet
      title="New selection"
      subtitle={board.estimate ? `Allowances from ${board.estimate.title ?? 'the estimate'}` : 'No estimate on this job yet'}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {error && <p className="flex-1 text-xs text-red-600">{error}</p>}
          <button onClick={onClose} className="ml-auto px-4 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add selection'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 1. Cost code first — it decides the allowance question */}
        <div>
          <label className={labelClass}>Cost code</label>
          {costCode !== null ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
              <Check size={15} className="text-green-600 shrink-0" />
              <span className="text-sm text-navy-900 truncate">
                {shownCode && <span className="font-mono text-xs text-gray-500 mr-1.5">{shownCode}</span>}
                {codeLabel}
              </span>
              <button onClick={clearCode} className="ml-auto text-xs font-semibold text-navy-600">Change</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search the estimate or cost book"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <div className="mt-2 rounded-lg border border-border divide-y divide-border max-h-64 overflow-y-auto">
                {estimateMatches.length > 0 && (
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-surface">On the estimate</p>
                )}
                {estimateMatches.map(l => (
                  <button
                    key={l.id}
                    onClick={() => pickCode(l.cost_code as string, l.description, l, l.description)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100"
                  >
                    <span className="font-mono text-xs text-gray-500 shrink-0">{(l.cost_code ?? '').replace(/\.+$/, '')}</span>
                    <span className="text-sm text-navy-900 truncate">{l.description}</span>
                    {l.allowance_id && (
                      <span className="ml-auto shrink-0 text-[11px] font-semibold text-gold-600">
                        {fmtMoney(board.allowances.find(a => a.id === l.allowance_id)?.amount ?? 0)} allowance
                      </span>
                    )}
                  </button>
                ))}
                {catalog.length > 0 && (
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-surface">Cost book</p>
                )}
                {catalog.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickCode(c.cost_code, c.title, null, c.title)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100"
                  >
                    <span className="font-mono text-xs text-gray-500 shrink-0">{c.cost_code.replace(/\.+$/, '')}</span>
                    <span className="text-sm text-navy-900 truncate">{c.title}</span>
                  </button>
                ))}
                <button onClick={skipCode} className="w-full px-3 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50">
                  No cost code
                </button>
              </div>
            </>
          )}
        </div>

        {/* 2. The allowance question for that code */}
        {situation && costCode !== '' && (
          <div className="rounded-xl border border-gold-300 bg-gold-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-navy-900">
              {situation === 'existing' && (
                <>{matchingAllowances[0].title} has a {fmtMoney(matchingAllowances[0].amount)} allowance. Link to it?</>
              )}
              {situation === 'estimate_no_allowance' && (
                <>{shownCode} is on the estimate with no allowance. Add one?</>
              )}
              {situation === 'not_on_estimate' && <>This isn&apos;t in the contract. How should it be paid for?</>}
            </p>

            {situation === 'existing' && (
              <Option active={mode === 'link'} onClick={() => setMode('link')} label="Link to the allowance">
                {matchingAllowances.length > 1 && mode === 'link' && (
                  <select value={linkId} onChange={e => setLinkId(e.target.value)} className={`${inputClass} mt-2`}>
                    {matchingAllowances.map(a => (
                      <option key={a.id} value={a.id}>{a.title} — {fmtMoney(a.remaining)} left of {fmtMoney(a.amount)}</option>
                    ))}
                  </select>
                )}
                {matchingAllowances.length === 1 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtMoney(matchingAllowances[0].remaining)} left of {fmtMoney(matchingAllowances[0].amount)}
                  </p>
                )}
              </Option>
            )}

            <Option
              active={mode === 'new'}
              onClick={() => setMode('new')}
              label={situation === 'existing' ? 'Add a separate allowance' : 'Add an allowance'}
              hint={situation === 'estimate_no_allowance' ? 'Internal tracking — the client doesn’t sign anything' : undefined}
            >
              {mode === 'new' && (
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Amount"
                    className={`${inputClass} pl-7`}
                  />
                </div>
              )}
            </Option>

            {situation !== 'existing' && board.allowances.length > 0 && (
              <Option
                active={mode === 'link'}
                onClick={() => { setMode('link'); if (!linkId) setLinkId(board.allowances[0].id) }}
                label="Share an existing allowance"
                hint="e.g. one shower allowance for walls, floor and faucet"
              >
                {mode === 'link' && (
                  <select value={linkId} onChange={e => setLinkId(e.target.value)} className={`${inputClass} mt-2`}>
                    {board.allowances.map(a => (
                      <option key={a.id} value={a.id}>{a.title} — {fmtMoney(a.remaining)} left of {fmtMoney(a.amount)}</option>
                    ))}
                  </select>
                )}
              </Option>
            )}

            {situation === 'not_on_estimate' && (
              <Option
                active={mode === 'change_order'}
                onClick={() => setMode('change_order')}
                label="Full price is an add"
                hint="Picking a choice drafts a change order for its whole price"
              />
            )}

            <Option active={mode === 'none'} onClick={() => setMode('none')} label="No allowance" hint="Just a decision, like paint color" />
          </div>
        )}

        {/* 3. Name and room */}
        <div>
          <label className={labelClass}>Selection name</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Vanity faucet" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            list="selection-rooms"
            placeholder="e.g. Hall Bath"
            className={inputClass}
          />
          <datalist id="selection-rooms">
            {ROOM_SUGGESTIONS.map(r => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>
    </Sheet>
  )
}

function Option({
  active, onClick, label, hint, children,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-white px-3 py-2.5 cursor-pointer transition-colors ${
        active ? 'border-navy-900 ring-1 ring-navy-900' : 'border-border hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-navy-900 bg-navy-900 shadow-[inset_0_0_0_2px_white]' : 'border-gray-300'}`} />
        <span className="text-sm font-medium text-navy-900">{label}</span>
      </div>
      {hint && <p className="text-xs text-gray-500 mt-0.5 ml-[26px]">{hint}</p>}
      {children && <div className="ml-[26px]" onClick={e => e.stopPropagation()}>{children}</div>}
    </div>
  )
}
