'use client'

import { useCallback, useEffect, useState } from 'react'

interface Change {
  id: string
  entity: string
  action: string
  qb_entity_id: string | null
  payload: Record<string, unknown>
  before: Record<string, unknown> | null
  summary: string
  reason: string | null
  requested_note: string | null
  status: string
  decided_at: string | null
  decision_note: string | null
  error: string | null
  result_qb_id: string | null
  created_at: string
  expires_at: string
  decider: { full_name: string } | { full_name: string }[] | null
}

const ACTION_STYLE: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-amber-100 text-amber-800',
  send: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  void: 'bg-red-100 text-red-800',
  deactivate: 'bg-red-100 text-red-800',
}
const DESTRUCTIVE = new Set(['delete', 'void', 'deactivate'])

const STATUS_STYLE: Record<string, string> = {
  executed: 'text-green-700', failed: 'text-red-700', rejected: 'text-gray-500', expired: 'text-gray-400', approving: 'text-amber-700',
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function show(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('value' in o && Object.keys(o).length <= 2) return String(o.name ?? o.value)
    if ('Address' in o) return String(o.Address)
    if ('FreeFormNumber' in o) return String(o.FreeFormNumber)
    return Object.values(o).filter(x => typeof x !== 'object' && x !== '').join(', ')
  }
  return String(v)
}

type Line = { Description?: string; Amount?: number; DetailType?: string; SalesItemLineDetail?: { ItemRef?: { value: string; name?: string }; Qty?: number; UnitPrice?: number } }

function LinesTable({ lines }: { lines: Line[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-gray-500"><th className="py-1 pr-2">Item</th><th className="pr-2">Qty</th><th className="pr-2">Rate</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-gray-100 align-top">
              <td className="py-1 pr-2">{l.Description || l.SalesItemLineDetail?.ItemRef?.name || `Item #${l.SalesItemLineDetail?.ItemRef?.value ?? ''}`}</td>
              <td className="pr-2">{l.SalesItemLineDetail?.Qty ?? ''}</td>
              <td className="pr-2">{l.SalesItemLineDetail?.UnitPrice !== undefined ? money(l.SalesItemLineDetail.UnitPrice) : ''}</td>
              <td className="text-right">{l.Amount !== undefined ? money(l.Amount) : ''}</td>
            </tr>
          ))}
          <tr className="border-t border-gray-200 font-semibold"><td colSpan={3} className="py-1">Total</td><td className="text-right">{money(lines.reduce((s, l) => s + (l.Amount ?? 0), 0))}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function Details({ c }: { c: Change }) {
  const rows = Object.entries(c.payload).filter(([k]) => k !== 'Line' && k !== 'send_to')
  const lines = (c.payload.Line as Line[] | undefined) ?? null
  const old = c.before ?? {}
  return (
    <div className="mt-3 space-y-3 text-sm">
      {c.action === 'send' && <p>Will email to <b>{String(c.payload.send_to ?? 'the address on file')}</b>.</p>}
      {rows.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-2">
              <span className="text-gray-500 min-w-[7.5rem]">{k}</span>
              {c.action === 'update'
                ? <span><span className="text-gray-400 line-through mr-1">{show(old[k])}</span>→ <b>{show(v)}</b></span>
                : <b>{show(v)}</b>}
            </div>
          ))}
        </div>
      )}
      {lines && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500 mb-1">{c.action === 'update' ? 'New lines (replace all existing lines)' : 'Lines'}</p>
          <LinesTable lines={lines} />
          {c.action === 'update' && Array.isArray(old.Line) && (
            <details className="mt-2 text-xs text-gray-500"><summary className="cursor-pointer">Current lines in QuickBooks</summary>
              <LinesTable lines={(old.Line as Line[]).filter(l => l.DetailType !== 'SubTotalLineDetail')} />
            </details>
          )}
        </div>
      )}
      {(c.action === 'delete' || c.action === 'void' || c.action === 'deactivate') && c.before && (
        <div className="rounded-lg bg-red-50 p-3 text-xs space-y-0.5">
          {['DisplayName', 'DocNumber', 'TxnDate', 'TotalAmt', 'Balance'].filter(k => old[k] !== undefined).map(k => (
            <div key={k}><span className="text-gray-500">{k}: </span><b>{k.endsWith('Amt') || k === 'Balance' ? money(Number(old[k])) : show(old[k])}</b></div>
          ))}
          {old.CustomerRef !== undefined && <div><span className="text-gray-500">Customer: </span><b>{show(old.CustomerRef)}</b></div>}
        </div>
      )}
    </div>
  )
}

export function QuickBooksApprovalsClient() {
  const [pending, setPending] = useState<Change[]>([])
  const [recent, setRecent] = useState<Change[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/changes', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load')
      setPending(json.pending); setRecent(json.recent); setErr(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function decide(c: Change, decision: 'approve' | 'reject') {
    if (busy) return
    if (decision === 'approve' && DESTRUCTIVE.has(c.action) && !window.confirm(`${c.summary}\n\nThis changes your real QuickBooks books. Continue?`)) return
    setBusy(c.id)
    try {
      const res = await fetch(`/api/quickbooks/changes/${c.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) })
      const json = await res.json()
      setMsg(m => ({ ...m, [c.id]: res.ok ? (decision === 'approve' ? 'Done in QuickBooks.' : 'Rejected.') : (json.error ?? 'Failed') }))
    } catch (e) { setMsg(m => ({ ...m, [c.id]: e instanceof Error ? e.message : 'Failed' })) }
    finally { setBusy(null); void load() }
  }

  const decider = (c: Change) => (Array.isArray(c.decider) ? c.decider[0] : c.decider)?.full_name

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-navy-900">QuickBooks approvals</h1>
        <p className="text-sm text-gray-600 mt-1">Fixer proposes changes here. Nothing reaches QuickBooks until you approve it.</p>
      </div>

      {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && pending.length === 0 && <p className="text-sm text-gray-500 bg-white border border-border rounded-xl p-4">Nothing is waiting for approval.</p>}

      <div className="space-y-4">
        {pending.map(c => (
          <div key={c.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start gap-2">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ACTION_STYLE[c.action] ?? 'bg-gray-100'}`}>{c.action}</span>
              <span className="text-[10px] uppercase text-gray-400 mt-0.5">{c.entity}</span>
              <span className="ml-auto text-xs text-gray-400">{when(c.created_at)}</span>
            </div>
            <p className="font-semibold text-navy-900 mt-2">{c.summary}</p>
            {(c.reason || c.requested_note) && (
              <p className="text-xs text-gray-500 mt-1">{c.requested_note ? `Asked by ${c.requested_note}. ` : ''}{c.reason}</p>
            )}
            <Details c={c} />
            {msg[c.id] && <p className="text-sm mt-3 text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{msg[c.id]}</p>}
            <div className="flex gap-2 mt-4">
              <button disabled={!!busy} onClick={() => decide(c, 'approve')}
                className={`flex-1 md:flex-none text-sm font-semibold text-white px-4 py-2.5 rounded-lg disabled:opacity-50 ${DESTRUCTIVE.has(c.action) ? 'bg-red-700' : 'bg-navy-900'}`}>
                {busy === c.id ? 'Working…' : 'Approve'}
              </button>
              <button disabled={!!busy} onClick={() => decide(c, 'reject')}
                className="flex-1 md:flex-none text-sm font-semibold border border-gray-300 px-4 py-2.5 rounded-lg disabled:opacity-50">Reject</button>
            </div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy-900 mb-2">Recent</h2>
          <div className="bg-white border border-border rounded-xl divide-y divide-gray-100">
            {recent.map(c => (
              <div key={c.id} className="p-3 text-sm">
                <div className="flex gap-2 items-baseline">
                  <span className={`text-[10px] font-bold uppercase ${STATUS_STYLE[c.status] ?? ''}`}>{c.status}</span>
                  <span className="text-xs text-gray-400 ml-auto">{when(c.decided_at ?? c.created_at)}{decider(c) ? ` · ${decider(c)}` : ''}</span>
                </div>
                <p className="mt-0.5">{c.summary}</p>
                {c.error && <p className="text-xs text-red-700 mt-1">{c.error}</p>}
                {c.status === 'executed' && c.result_qb_id && <p className="text-xs text-gray-400 mt-0.5">QuickBooks #{c.result_qb_id}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
