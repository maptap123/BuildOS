'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Bell, Check, ChevronDown, MessageSquare, Phone, Plus,
  Search, Trash2, UserPlus, X,
} from 'lucide-react'
import { useVendors } from '@/hooks/useVendors'
import { useUsers } from '@/hooks/useUsers'
import type {
  ScheduleAssignment,
  ScheduleAssignmentStatus,
  ScheduleAssigneeType,
} from '@/types'

// ─── Status presentation ──────────────────────────────────────────────────────

const STATUS_CFG: Record<ScheduleAssignmentStatus, { label: string; cls: string }> = {
  pending:   { label: 'Not sent',  cls: 'bg-gray-100 text-gray-600'   },
  sent:      { label: 'Awaiting',  cls: 'bg-amber-50 text-amber-700'  },
  confirmed: { label: 'Confirmed', cls: 'bg-green-50 text-green-700'  },
  declined:  { label: 'Declined',  cls: 'bg-red-50 text-red-600'      },
  cancelled: { label: 'Removed',   cls: 'bg-gray-100 text-gray-400'   },
}

/** A person picked before the phase exists — sent as soon as it is saved. */
export interface PendingAssignee {
  type: ScheduleAssigneeType
  id: string
  name: string
  phone: string | null
}

interface Props {
  /** Undefined while creating a new phase — selections are queued instead of sent. */
  itemId?: string
  pending: PendingAssignee[]
  onPendingChange: (next: PendingAssignee[]) => void
  onCountChange?: (count: number) => void
}

export function ScheduleCrewTab({ itemId, pending, onPendingChange, onCountChange }: Props) {
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([])
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule/${itemId}/assignments`)
      if (!res.ok) return
      const data = await res.json() as { assignments: ScheduleAssignment[]; sms_enabled: boolean }
      setAssignments(data.assignments ?? [])
      setSmsEnabled(data.sms_enabled)
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => { void refresh() }, [refresh])

  const active = useMemo(
    () => assignments.filter(a => a.status !== 'cancelled'),
    [assignments]
  )

  useEffect(() => {
    onCountChange?.(itemId ? active.length : pending.length)
  }, [active.length, pending.length, itemId, onCountChange])

  const assignedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const a of active) {
      keys.add(`${a.assignee_type}:${a.vendor_id ?? a.user_id ?? a.contact_id}`)
    }
    for (const p of pending) keys.add(`${p.type}:${p.id}`)
    return keys
  }, [active, pending])

  async function addPeople(people: PendingAssignee[]) {
    setShowPicker(false)
    if (people.length === 0) return

    if (!itemId) {
      onPendingChange([...pending, ...people])
      return
    }

    setBusyId('add')
    setNotice(null)
    try {
      const res = await fetch(`/api/schedule/${itemId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignees: people.map(p => ({ type: p.type, id: p.id })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not assign')

      const results = (data.results ?? []) as { name: string; sent: boolean; error?: string }[]
      const failed = results.filter(r => !r.sent)
      setNotice(
        failed.length === 0
          ? { type: 'ok', text: `Texted ${results.length} ${results.length === 1 ? 'person' : 'people'}` }
          : { type: 'err', text: failed.map(f => `${f.name}: ${f.error}`).join(' · ') }
      )
      await refresh()
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusyId(null)
    }
  }

  async function act(assignment: ScheduleAssignment, action: 'remind' | 'confirm' | 'decline' | 'send_calendar') {
    if (!itemId) return
    setBusyId(assignment.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/schedule/${itemId}/assignments/${assignment.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      setNotice({ type: 'ok', text: data.message ?? 'Done' })
      await refresh()
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(assignment: ScheduleAssignment) {
    if (!itemId) return
    const notifyThem =
      assignment.status !== 'pending' &&
      assignment.phone !== null &&
      window.confirm(`Text ${assignment.contact_name} that this phase is off their schedule?`)

    setBusyId(assignment.id)
    try {
      await fetch(
        `/api/schedule/${itemId}/assignments/${assignment.id}?notify=${notifyThem}`,
        { method: 'DELETE' }
      )
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="px-6 py-5">
      {!smsEnabled && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 mb-4">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>
            Twilio isn&apos;t configured yet, so nobody will get a text. People can still be
            assigned and confirmed by hand.
          </span>
        </div>
      )}

      {!itemId && pending.length > 0 && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-4">
          {pending.length} {pending.length === 1 ? 'person gets' : 'people get'} a text as soon as
          you save this phase.
        </p>
      )}

      {/* Queued people (create mode) */}
      {!itemId && pending.length > 0 && (
        <ul className="space-y-2 mb-4">
          {pending.map(p => (
            <li
              key={`${p.type}:${p.id}`}
              className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-800 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.phone ?? 'No mobile number on file'}</p>
              </div>
              <button
                type="button"
                onClick={() => onPendingChange(pending.filter(x => !(x.type === p.type && x.id === p.id)))}
                className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Live assignments (edit mode) */}
      {itemId && (
        loading && assignments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading crew…</p>
        ) : active.length === 0 ? (
          <div className="text-center py-8">
            <UserPlus size={28} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Nobody assigned yet</p>
            <p className="text-xs text-gray-300 mt-0.5">
              Assign a sub and Fixer texts them to confirm
            </p>
          </div>
        ) : (
          <ul className="space-y-2 mb-4">
            {active.map(a => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                busy={busyId === a.id}
                threadOpen={openThread === a.id}
                onToggleThread={() => setOpenThread(openThread === a.id ? null : a.id)}
                onAct={action => act(a, action)}
                onRemove={() => remove(a)}
              />
            ))}
          </ul>
        )
      )}

      {notice && (
        <p className={`text-xs mb-3 ${notice.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {notice.text}
        </p>
      )}

      {showPicker ? (
        <PeoplePicker
          excluded={assignedKeys}
          onCancel={() => setShowPicker(false)}
          onAdd={addPeople}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          disabled={busyId === 'add'}
          className="flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900 transition-colors disabled:opacity-60"
        >
          <Plus size={14} className="text-gold-500" />
          {busyId === 'add' ? 'Sending…' : 'Assign someone'}
        </button>
      )}
    </div>
  )
}

// ─── One assigned person ──────────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  busy,
  threadOpen,
  onToggleThread,
  onAct,
  onRemove,
}: {
  assignment: ScheduleAssignment
  busy: boolean
  threadOpen: boolean
  onToggleThread: () => void
  onAct: (action: 'remind' | 'confirm' | 'decline' | 'send_calendar') => void
  onRemove: () => void
}) {
  const cfg = STATUS_CFG[assignment.status]
  const messages = assignment.messages ?? []

  return (
    <li className={`border rounded-lg ${assignment.needs_attention ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-navy-800 truncate">{assignment.contact_name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${cfg.cls}`}>
              {cfg.label}
            </span>
            {assignment.needs_attention && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                <AlertCircle size={11} />
                Needs you
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <Phone size={10} />
            {assignment.phone ?? 'No mobile number on file'}
            {assignment.reminder_count > 0 && ` · ${assignment.reminder_count} reminder${assignment.reminder_count > 1 ? 's' : ''}`}
          </p>
          {assignment.response_note && (
            <p className="text-xs text-gray-500 mt-1 italic">“{assignment.response_note}”</p>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          title="Remove from this phase"
          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1 flex-wrap px-3 pb-2.5">
        {assignment.status !== 'confirmed' && (
          <RowButton onClick={() => onAct('confirm')} disabled={busy}>
            <Check size={11} /> Mark confirmed
          </RowButton>
        )}
        {assignment.phone && assignment.status !== 'confirmed' && (
          <RowButton onClick={() => onAct('remind')} disabled={busy}>
            <Bell size={11} /> {assignment.status === 'pending' ? 'Send invite' : 'Remind'}
          </RowButton>
        )}
        {assignment.phone && assignment.status === 'confirmed' && (
          <RowButton onClick={() => onAct('send_calendar')} disabled={busy}>
            <Bell size={11} /> Resend calendar link
          </RowButton>
        )}
        {messages.length > 0 && (
          <RowButton onClick={onToggleThread} disabled={false}>
            <MessageSquare size={11} />
            {messages.length} {messages.length === 1 ? 'text' : 'texts'}
            <ChevronDown size={11} className={threadOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </RowButton>
        )}
      </div>

      {threadOpen && messages.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-2 bg-gray-50/60">
          {messages.map(m => (
            <div key={m.id} className={m.direction === 'inbound' ? 'text-left' : 'text-right'}>
              <div
                className={`inline-block max-w-[85%] text-xs rounded-lg px-2.5 py-1.5 whitespace-pre-wrap text-left ${
                  m.direction === 'inbound'
                    ? 'bg-white border border-gray-200 text-navy-800'
                    : 'bg-navy-800 text-white'
                }`}
              >
                {m.body}
              </div>
              <p className="text-[9px] text-gray-400 mt-0.5">
                {m.direction === 'inbound' ? 'Them' : m.ai_generated ? 'Fixer' : 'BuildOS'} ·{' '}
                {new Date(m.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

function RowButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-navy-800 border border-gray-200 hover:border-gray-300 rounded-md px-2 py-1 transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  )
}

// ─── Picker ───────────────────────────────────────────────────────────────────

function PeoplePicker({
  excluded,
  onCancel,
  onAdd,
}: {
  excluded: Set<string>
  onCancel: () => void
  onAdd: (people: PendingAssignee[]) => void
}) {
  const { vendors } = useVendors()
  const { users } = useUsers()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PendingAssignee[]>([])

  const options = useMemo<PendingAssignee[]>(() => {
    const subs: PendingAssignee[] = vendors.map(v => ({
      type: 'vendor',
      id: v.id,
      name: v.contact_name ? `${v.contact_name} — ${v.name}` : v.name,
      phone: v.phone,
    }))
    const crew: PendingAssignee[] = users.map(u => ({
      type: 'user',
      id: u.id,
      name: u.full_name || u.email,
      phone: null,
    }))
    return [...subs, ...crew].filter(o => !excluded.has(`${o.type}:${o.id}`))
  }, [vendors, users, excluded])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter(o => o.name.toLowerCase().includes(q)) : options
  }, [options, search])

  function toggle(option: PendingAssignee) {
    const key = `${option.type}:${option.id}`
    setSelected(sel =>
      sel.some(s => `${s.type}:${s.id}` === key)
        ? sel.filter(s => `${s.type}:${s.id}` !== key)
        : [...sel, option]
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="relative border-b border-gray-100">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          // The picker lives inside the phase form — Enter here must not save the phase.
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          placeholder="Search subs and crew…"
          className="w-full pl-9 pr-9 py-2.5 text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No matches</p>
        ) : (
          filtered.map(option => {
            const key = `${option.type}:${option.id}`
            const isSelected = selected.some(s => `${s.type}:${s.id}` === key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(option)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-gold-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-navy-800 truncate">{option.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {option.type === 'vendor' ? 'Sub' : 'Crew'}
                    {option.phone ? ` · ${option.phone}` : ' · no mobile on file'}
                  </p>
                </div>
                {isSelected && <Check size={14} className="text-gold-600 shrink-0" />}
              </button>
            )
          })
        )}
      </div>

      <div className="flex gap-2 p-2 border-t border-gray-100 bg-gray-50/60">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs font-medium text-gray-500 hover:text-gray-700 py-2 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onAdd(selected)}
          disabled={selected.length === 0}
          className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-md transition-colors"
        >
          Assign &amp; text {selected.length > 0 ? selected.length : ''}
        </button>
      </div>
    </div>
  )
}
