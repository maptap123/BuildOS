'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, AlertTriangle, FileText } from 'lucide-react'
import { divisionPhase } from '@/lib/estimates/divisions'
import type { AllowanceSummary, Selection, SelectionsBoard, SelectionStatus } from '@/types'
import { fmtMoney } from './Sheet'
import { NewSelectionSheet } from './NewSelectionSheet'
import { SelectionDetailSheet } from './SelectionDetailSheet'

type Perms = { can_create: boolean; can_edit: boolean; can_delete: boolean }

const STATUS_CHIP: Record<SelectionStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  selected: 'bg-green-100 text-green-800',
  ordered: 'bg-blue-100 text-blue-800',
  installed: 'bg-navy-100 text-navy-900',
}
const STATUS_LABEL: Record<SelectionStatus, string> = {
  pending: 'Pending', selected: 'Selected', ordered: 'Ordered', installed: 'Installed',
}

const NO_LOCATION = 'No location'

/**
 * A job's selections. Mobile shows cards grouped by room — the showroom flow: tap a
 * card, add the choice the client picked, done. Desktop shows the same as a table plus
 * the allowance roll-up. Allowances are pulled from the estimate on every load.
 */
export function SelectionsClient({
  jobId,
  initialBoard,
  permissions,
}: {
  jobId: string
  initialBoard: SelectionsBoard
  permissions: Perms
}) {
  const [board, setBoard] = useState(initialBoard)
  const [tab, setTab] = useState<'selections' | 'allowances'>('selections')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/selections`, { cache: 'no-store' })
    if (res.ok) setBoard(await res.json())
  }, [jobId])

  const allowanceById = useMemo(() => new Map(board.allowances.map(a => [a.id, a])), [board.allowances])

  const groups = useMemo(() => {
    const map = new Map<string, Selection[]>()
    for (const s of board.selections) {
      const key = s.location?.trim() || NO_LOCATION
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b))
  }, [board.selections])

  const totals = useMemo(() => {
    const amount = board.allowances.reduce((s, a) => s + a.amount, 0)
    const spent = board.allowances.reduce((s, a) => s + a.spent, 0)
    const over = board.allowances.reduce((s, a) => s + Math.max(0, -a.remaining), 0)
    const pending = board.selections.filter(s => s.status === 'pending').length
    return { amount, spent, over, pending }
  }, [board])

  const needsReview = board.allowances.filter(a => a.needs_review)
  const open = board.selections.find(s => s.id === openId) ?? null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-navy-900">Selections</h3>
          <p className="text-xs text-gray-500 truncate">
            {board.estimate
              ? <>Allowances pulled from <span className="font-medium text-gray-700">{board.estimate.title ?? 'the estimate'}</span> ({board.estimate.status})</>
              : 'No estimate on this job yet — allowances can still be added by hand'}
          </p>
        </div>
        {permissions.can_create && (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold active:scale-[0.98]"
          >
            <Plus size={16} /> <span className="hidden sm:inline">New selection</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Total label="Allowances" value={fmtMoney(totals.amount)} />
        <Total label="Selected" value={fmtMoney(totals.spent)} />
        <Total label="Over allowance" value={fmtMoney(totals.over)} tone={totals.over > 0 ? 'bad' : undefined} />
        <Total label="Still pending" value={String(totals.pending)} />
      </div>

      {needsReview.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-navy-900">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p>
            {needsReview.length === 1 ? 'One allowance' : `${needsReview.length} allowances`} on the estimate had no dollar amount
            ({needsReview.map(a => `"${a.allowance_text}"`).join(', ')}), so {needsReview.length === 1 ? 'it was' : 'they were'} set to $0.
            Fix the amount on the estimate.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(['selections', 'allowances'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {t === 'selections' ? 'Selections' : 'Allowances'}
            <span className={`ml-2 text-[11px] ${tab === t ? 'text-white/70' : 'text-gray-400'}`}>
              {t === 'selections' ? board.selections.length : board.allowances.length}
            </span>
          </button>
        ))}
      </div>

      {tab === 'selections' ? (
        board.selections.length === 0 ? (
          <EmptyState hasEstimate={!!board.estimate} canCreate={permissions.can_create} onCreate={() => setCreating(true)} />
        ) : (
          <div className="space-y-5">
            {groups.map(([location, items]) => (
              <section key={location}>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                  {location} <span className="font-semibold">· {items.length}</span>
                </h4>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {items.map(s => (
                    <SelectionCard key={s.id} selection={s} allowance={s.allowance_id ? allowanceById.get(s.allowance_id) : undefined} onOpen={() => setOpenId(s.id)} />
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block bg-white border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left font-semibold px-4 py-2">Selection</th>
                        <th className="text-left font-semibold px-4 py-2">Category</th>
                        <th className="text-left font-semibold px-4 py-2">Choice</th>
                        <th className="text-right font-semibold px-4 py-2">Price</th>
                        <th className="text-right font-semibold px-4 py-2">Allowance left</th>
                        <th className="text-left font-semibold px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map(s => {
                        const picked = s.choices.find(c => c.is_selected)
                        const a = s.allowance_id ? allowanceById.get(s.allowance_id) : undefined
                        return (
                          <tr key={s.id} onClick={() => setOpenId(s.id)} className="cursor-pointer hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-navy-900">{s.title}</td>
                            <td className="px-4 py-2.5 text-gray-500">{s.cost_code ? divisionPhase(null, s.cost_code) : '—'}</td>
                            <td className="px-4 py-2.5 text-gray-700 max-w-[260px] truncate">
                              {picked?.title ?? <span className="text-gray-400">{s.choices.length ? `${s.choices.length} option${s.choices.length === 1 ? '' : 's'}` : 'No choices'}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{picked ? fmtMoney(Number(picked.client_price)) : '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {a ? <AllowanceLeft allowance={a} /> : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CHIP[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <AllowancesTab jobId={jobId} board={board} permissions={permissions} onChanged={refresh} />
      )}

      {creating && (
        <NewSelectionSheet
          jobId={jobId}
          board={board}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await refresh() }}
        />
      )}
      {open && (
        <SelectionDetailSheet
          key={open.id}
          jobId={jobId}
          selection={open}
          board={board}
          permissions={permissions}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

function SelectionCard({
  selection: s, allowance, onOpen,
}: {
  selection: Selection
  allowance?: AllowanceSummary
  onOpen: () => void
}) {
  const picked = s.choices.find(c => c.is_selected)
  return (
    <button onClick={onOpen} className="w-full text-left bg-white border border-border rounded-xl p-3.5 active:bg-gray-50 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-navy-900 truncate">{s.title}</p>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CHIP[s.status]}`}>{STATUS_LABEL[s.status]}</span>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {picked ? `${picked.title} · ${fmtMoney(Number(picked.client_price))}` : s.choices.length ? `${s.choices.length} option${s.choices.length === 1 ? '' : 's'}, none picked` : 'No choices yet'}
        </p>
        {allowance && (
          <p className="text-xs mt-1"><AllowanceLeft allowance={allowance} long /></p>
        )}
      </div>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </button>
  )
}

function AllowanceLeft({ allowance: a, long }: { allowance: AllowanceSummary; long?: boolean }) {
  if (a.remaining < 0) {
    return <span className="font-semibold text-red-600">{fmtMoney(-a.remaining)} over{long && <> {fmtMoney(a.amount)}</>}</span>
  }
  return (
    <span className="text-gray-600">
      <span className="font-semibold text-green-700">{fmtMoney(a.remaining)}</span>{long ? ` left of ${fmtMoney(a.amount)}` : ` of ${fmtMoney(a.amount)}`}
    </span>
  )
}

function AllowancesTab({
  jobId, board, permissions, onChanged,
}: {
  jobId: string
  board: SelectionsBoard
  permissions: Perms
  onChanged: () => Promise<void>
}) {
  const [error, setError] = useState('')

  async function editAmount(a: AllowanceSummary) {
    const raw = prompt(`New amount for "${a.title}"`, String(a.amount))
    if (raw === null) return
    const res = await fetch(`/api/selections/allowances/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Number(raw.replace(/[$,]/g, '')) }),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save'); return }
    setError('')
    await onChanged()
  }

  async function remove(a: AllowanceSummary) {
    if (!confirm(`Remove the "${a.title}" allowance? Its selections stay, without an allowance.`)) return
    const res = await fetch(`/api/selections/allowances/${a.id}`, { method: 'DELETE' })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not remove'); return }
    setError('')
    await onChanged()
  }

  if (board.allowances.length === 0) {
    return (
      <div className="bg-white border border-dashed border-border rounded-xl p-6 text-center text-sm text-gray-500">
        No allowances yet. Type them on the estimate (&quot;$525 Allowance&quot;) and they show up here.
      </div>
    )
  }

  const total = board.allowances.reduce((s, a) => s + a.amount, 0)
  const spent = board.allowances.reduce((s, a) => s + a.spent, 0)

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {board.allowances.map(a => {
        const cos = board.changeOrders.filter(c => c.allowance_id === a.id)
        return (
          <div key={a.id} className="bg-white border border-border rounded-xl p-3.5">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-navy-900">{a.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.source === 'estimate' ? 'bg-gold-100 text-gold-600' : 'bg-gray-100 text-gray-600'}`}>
                    {a.source === 'estimate' ? 'From estimate' : 'Added'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[a.cost_code?.replace(/\.+$/, ''), `${a.selection_count} selection${a.selection_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                </p>
                {cos.map(c => (
                  <Link key={c.id} href={`/jobs/${jobId}/budget?tab=change_orders`} className="inline-flex items-center gap-1 mt-1 mr-3 text-xs font-semibold text-amber-700">
                    <FileText size={12} /> {c.co_number} {c.status} · {fmtMoney(c.amount)}
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 text-right text-sm tabular-nums">
                <Num label="Allowance" value={fmtMoney(a.amount)} />
                <Num label="Selected" value={fmtMoney(a.spent)} />
                <Num label="Difference" value={fmtMoney(a.remaining)} tone={a.remaining < 0 ? 'bad' : 'good'} />
              </div>
            </div>
            {a.source === 'manual' && (permissions.can_edit || permissions.can_delete) && (
              <div className="flex gap-4 mt-2 pt-2 border-t border-border">
                {permissions.can_edit && <button onClick={() => editAmount(a)} className="text-xs font-semibold text-navy-600">Change amount</button>}
                {permissions.can_delete && <button onClick={() => remove(a)} className="text-xs font-semibold text-red-600">Remove</button>}
              </div>
            )}
          </div>
        )
      })}
      <div className="flex justify-end gap-6 px-3.5 py-3 bg-surface rounded-xl text-sm tabular-nums">
        <span className="text-gray-500">Total</span>
        <span>{fmtMoney(total)}</span>
        <span>{fmtMoney(spent)}</span>
        <span className={total - spent < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>{fmtMoney(total - spent)}</span>
      </div>
    </div>
  )
}

function Total({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="bg-white border border-border rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-navy-900'}`}>{value}</p>
    </div>
  )
}

function Num({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">{label}</p>
      <p className={tone === 'bad' ? 'text-red-600 font-semibold' : tone === 'good' ? 'text-green-700 font-semibold' : 'text-navy-900'}>{value}</p>
    </div>
  )
}

function EmptyState({ hasEstimate, canCreate, onCreate }: { hasEstimate: boolean; canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="bg-white border border-dashed border-border rounded-xl p-6 text-center">
      <p className="text-sm text-gray-600">
        {hasEstimate
          ? 'No allowances on the estimate yet. Type one on an estimate line ("$525 Allowance") and it shows up here with a selection ready.'
          : 'This job has no estimate yet. Allowances typed on its estimate will show up here automatically.'}
      </p>
      {canCreate && (
        <button onClick={onCreate} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-900 text-white text-sm font-semibold">
          <Plus size={15} /> New selection
        </button>
      )}
    </div>
  )
}
