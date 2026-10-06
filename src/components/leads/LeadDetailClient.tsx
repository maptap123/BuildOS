'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Navigation,
  User,
  Edit2,
  Briefcase,
  AlertCircle,
  Send,
  ExternalLink,
  ClipboardList,
  Loader2,
  Trash2,
  Paperclip,
  Camera,
  Upload,
  FileText,
  X,
  StickyNote,
  Users,
  RefreshCw,
  Tag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AddLeadModal } from './AddLeadModal'
import type {
  Lead, LeadActivity, LeadActivityKind, LeadAttachment, LeadStatus, LeadSource,
} from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  lead: Lead
  initialActivities: LeadActivity[]
  users: { id: string; name: string }[]
  currentUserId: string
  estimateCount: number
  permissions: Permissions
}

const STATUSES: LeadStatus[] = ['new', 'contacted', 'proposal', 'won', 'lost']

const STATUS_STYLES: Record<LeadStatus, string> = {
  new:       'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  proposal:  'bg-yellow-100 text-yellow-700',
  won:       'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-700',
}

const STATUS_ACTIVE: Record<LeadStatus, string> = {
  new:       'bg-gray-700 text-white border-gray-700',
  contacted: 'bg-blue-600 text-white border-blue-600',
  proposal:  'bg-yellow-500 text-white border-yellow-500',
  won:       'bg-green-600 text-white border-green-600',
  lost:      'bg-red-600 text-white border-red-600',
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new:       'New',
  contacted: 'Contacted',
  proposal:  'Proposal',
  won:       'Won',
  lost:      'Lost',
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  referral:  'Referral',
  website:   'Website',
  cold_call: 'Cold Call',
  repeat:    'Repeat Client',
  other:     'Other',
}

type LoggableKind = Exclude<LeadActivityKind, 'status'>

const KIND_META: Record<LeadActivityKind, { label: string; icon: typeof StickyNote; placeholder: string }> = {
  note:    { label: 'Note',    icon: StickyNote,    placeholder: 'Add a note…' },
  call:    { label: 'Call',    icon: Phone,         placeholder: 'How did the call go?' },
  text:    { label: 'Text',    icon: MessageSquare, placeholder: 'What was texted?' },
  email:   { label: 'Email',   icon: Mail,          placeholder: 'What was emailed?' },
  meeting: { label: 'Meeting', icon: Users,         placeholder: 'Meeting notes…' },
  status:  { label: 'Status',  icon: RefreshCw,     placeholder: '' },
}
const LOGGABLE: LoggableKind[] = ['note', 'call', 'text', 'email', 'meeting']

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return body.error ?? fallback
}

export function LeadDetailClient({
  lead: initialLead, initialActivities, users, currentUserId, estimateCount, permissions,
}: Props) {
  const router = useRouter()
  const [lead, setLead] = useState<Lead>(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>(initialActivities)
  const [attachments, setAttachments] = useState<LeadAttachment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [showConvertConfirm, setShowConvertConfirm] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingStatus, setSavingStatus] = useState<LeadStatus | null>(null)

  const [note, setNote] = useState('')
  const [kind, setKind] = useState<LoggableKind>('note')
  const [savingNote, setSavingNote] = useState(false)

  const [uploading, setUploading] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  const userName = new Map(users.map(u => [u.id, u.name]))
  const phoneDigits = lead.client_phone?.replace(/[^\d+]/g, '') ?? ''
  const mapsUrl = lead.address ? `https://maps.google.com/?q=${encodeURIComponent(lead.address)}` : null
  const canConvert = lead.status === 'won' && !lead.converted_job_id
  const amount = lead.proposal_total ?? lead.estimated_value

  useEffect(() => {
    fetch(`/api/leads/${lead.id}/attachments`)
      .then(r => (r.ok ? r.json() : []))
      .then(setAttachments)
      .catch(() => setAttachments([]))
  }, [lead.id])

  // ── Lead fields ────────────────────────────────────────────────────────
  async function patchLead(updates: Partial<Lead>): Promise<boolean> {
    setError(null)
    const res = await fetch(`/api/leads/${lead.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    })
    if (!res.ok) {
      setError(await readError(res, 'Failed to update lead'))
      return false
    }
    const { activity, ...saved } = await res.json()
    setLead(prev => ({ ...prev, ...saved }))
    if (activity) setActivities(prev => [...prev, activity])
    return true
  }

  async function changeStatus(status: LeadStatus) {
    if (status === lead.status || !permissions.can_edit) return
    setSavingStatus(status)
    await patchLead({ status })
    setSavingStatus(null)
  }

  function handleSaved(saved: Lead & { activity?: LeadActivity | null }) {
    const { activity, ...rest } = saved
    setLead(prev => ({ ...prev, ...rest }))
    if (activity) setActivities(prev => [...prev, activity])
    setShowEdit(false)
  }

  async function deleteLead() {
    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError(await readError(res, 'Failed to delete lead'))
      setDeleting(false)
      return
    }
    router.push('/leads')
    router.refresh()
  }

  async function convertToJob() {
    setConverting(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409 = already converted — just redirect to the existing job
        if (res.status === 409 && body.job_id) {
          router.push(`/jobs/${body.job_id}`)
          return
        }
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      setLead(prev => ({ ...prev, converted_job_id: body.job.id, status: 'won' }))
      router.push(`/jobs/${body.job.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to convert lead to job.')
      setConverting(false)
    }
  }

  // ── Activity ───────────────────────────────────────────────────────────
  async function addActivity(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setSavingNote(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/activities`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: note.trim(), kind }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Failed to save'))
      const saved: LeadActivity = await res.json()
      setActivities(prev => [...prev, saved])
      setNote('')
      setKind('note')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingNote(false)
    }
  }

  async function deleteActivity(act: LeadActivity) {
    if (!confirm('Delete this entry?')) return
    setError(null)
    const res = await fetch(`/api/leads/${lead.id}/activities?activityId=${act.id}`, { method: 'DELETE' })
    if (!res.ok) return setError(await readError(res, 'Failed to delete entry'))
    setActivities(prev => prev.filter(a => a.id !== act.id))
  }

  // ── Attachments ────────────────────────────────────────────────────────
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    const supabase = createClient()
    for (const file of Array.from(files)) {
      setUploading(file.name)
      try {
        const meta = { file_name: file.name, mime_type: file.type || null, size_bytes: file.size }
        const signRes = await fetch(`/api/leads/${lead.id}/attachments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meta, step: 'sign' }),
        })
        if (!signRes.ok) throw new Error(await readError(signRes, `Couldn't upload ${file.name}`))
        const { path, token } = await signRes.json()

        const { error: upErr } = await supabase.storage
          .from('lead-files')
          .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
        if (upErr) throw new Error(`Couldn't upload ${file.name}: ${upErr.message}`)

        const regRes = await fetch(`/api/leads/${lead.id}/attachments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meta, step: 'register', path }),
        })
        if (!regRes.ok) throw new Error(await readError(regRes, `Couldn't save ${file.name}`))
        const saved: LeadAttachment = await regRes.json()
        setAttachments(prev => [saved, ...(prev ?? [])])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
    }
    setUploading(null)
    if (fileInput.current) fileInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
  }

  async function deleteAttachment(att: LeadAttachment) {
    if (!confirm(`Delete ${att.file_name}?`)) return
    setError(null)
    const res = await fetch(`/api/leads/${lead.id}/attachments?attachmentId=${att.id}`, { method: 'DELETE' })
    if (!res.ok) return setError(await readError(res, 'Failed to delete file'))
    setAttachments(prev => (prev ?? []).filter(a => a.id !== att.id))
  }

  const images = (attachments ?? []).filter(a => a.mime_type?.startsWith('image/'))
  const otherFiles = (attachments ?? []).filter(a => !a.mime_type?.startsWith('image/'))

  // ── UI pieces ──────────────────────────────────────────────────────────
  const card = 'bg-white border border-border rounded-xl p-4 md:p-5'
  const cardTitle = 'text-xs font-semibold text-gray-400 uppercase tracking-wide'
  const btn = 'flex items-center justify-center gap-1.5 border text-sm font-medium px-3 py-2.5 md:py-2 rounded-lg transition-colors'

  const quickActions = [
    { label: 'Call',  icon: Phone,         href: phoneDigits ? `tel:${phoneDigits}` : null },
    { label: 'Text',  icon: MessageSquare, href: phoneDigits ? `sms:${phoneDigits}` : null },
    { label: 'Email', icon: Mail,          href: lead.client_email ? `mailto:${lead.client_email}` : null },
    { label: 'Map',   icon: Navigation,    href: mapsUrl },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6 pb-8">

      {/* ── Header ── */}
      <div>
        <button
          onClick={() => router.push('/leads')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-900 transition-colors mb-3"
        >
          <ArrowLeft size={15} />
          Back to Leads
        </button>

        <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-navy-900 text-2xl leading-tight break-words">{lead.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[lead.status]}`}>
                {STATUS_LABELS[lead.status]}
              </span>
              {amount != null && (
                <span className="text-sm font-semibold text-green-700">{formatCurrency(amount)}</span>
              )}
              {lead.source && (
                <span className="text-xs bg-navy-50 text-navy-600 px-2 py-0.5 rounded-full">
                  {SOURCE_LABELS[lead.source]}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 md:flex md:items-center gap-2 md:shrink-0">
            <Link href={`/leads/${lead.id}/estimate`} className={`${btn} border-gold-300 bg-gold-50 text-gold-700 hover:bg-gold-100`}>
              <ClipboardList size={14} />
              Estimate
            </Link>
            {permissions.can_edit && (
              <button onClick={() => setShowEdit(true)} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
                <Edit2 size={14} />
                Edit
              </button>
            )}
            {permissions.can_delete && (
              <button onClick={() => setShowDeleteConfirm(true)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}

      <div className="grid gap-4 md:gap-6 md:grid-cols-[minmax(0,1fr)_320px] items-start">

        {/* ── Sidebar (first on mobile) ── */}
        <div className="space-y-4 md:col-start-2 md:row-start-1">

          {/* Quick contact */}
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map(({ label, icon: Icon, href }) =>
              href ? (
                <a
                  key={label}
                  href={href}
                  target={label === 'Map' ? '_blank' : undefined}
                  rel={label === 'Map' ? 'noopener noreferrer' : undefined}
                  className="flex flex-col items-center gap-1 bg-white border border-border rounded-xl py-3 text-navy-900 hover:border-gold-300 hover:bg-gold-50 transition-colors"
                >
                  <Icon size={18} className="text-gold-600" />
                  <span className="text-xs font-medium">{label}</span>
                </a>
              ) : (
                <div key={label} className="flex flex-col items-center gap-1 bg-gray-50 border border-border rounded-xl py-3 text-gray-300">
                  <Icon size={18} />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ),
            )}
          </div>

          {/* Status */}
          <div className={card}>
            <h2 className={`${cardTitle} mb-3`}>Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={!permissions.can_edit || savingStatus !== null}
                  className={`flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full border transition-colors disabled:cursor-default ${
                    lead.status === s ? STATUS_ACTIVE[s] : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {savingStatus === s && <Loader2 size={12} className="animate-spin" />}
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {lead.converted_job_id ? (
              <button
                onClick={() => router.push(`/jobs/${lead.converted_job_id}`)}
                className={`${btn} w-full mt-4 border-green-300 bg-green-50 text-green-700 hover:bg-green-100`}
              >
                <ExternalLink size={14} />
                View Job
              </button>
            ) : canConvert && permissions.can_create ? (
              <button
                onClick={() => setShowConvertConfirm(true)}
                className={`${btn} w-full mt-4 border-green-600 bg-green-600 text-white hover:bg-green-700`}
              >
                <Briefcase size={14} />
                Convert to Job
              </button>
            ) : null}
          </div>

          {/* Details */}
          <div className={`${card} space-y-3`}>
            <h2 className={cardTitle}>Details</h2>

            {lead.client_name && (
              <div className="flex items-center gap-3">
                <User size={15} className="text-gray-400 shrink-0" />
                <span className="text-sm text-navy-900">{lead.client_name}</span>
              </div>
            )}
            {lead.client_email && (
              <div className="flex items-center gap-3 min-w-0">
                <Mail size={15} className="text-gray-400 shrink-0" />
                <a href={`mailto:${lead.client_email}`} className="text-sm text-blue-600 hover:underline truncate">
                  {lead.client_email}
                </a>
              </div>
            )}
            {lead.client_phone && (
              <div className="flex items-center gap-3">
                <Phone size={15} className="text-gray-400 shrink-0" />
                <a href={`tel:${phoneDigits}`} className="text-sm text-navy-900 hover:underline">{lead.client_phone}</a>
              </div>
            )}
            {lead.address && (
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-gray-400 shrink-0 mt-0.5" />
                <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="text-sm text-navy-900 hover:underline">
                  {lead.address}
                </a>
              </div>
            )}
            {!lead.client_name && !lead.client_email && !lead.client_phone && !lead.address && (
              <p className="text-sm text-gray-400 italic">No contact information added.</p>
            )}

            <div className="border-t border-border pt-3 space-y-3">
              <label className="flex items-center gap-3">
                <Tag size={15} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 w-24 shrink-0">Assigned to</span>
                <select
                  value={lead.assigned_to ?? ''}
                  onChange={e => patchLead({ assigned_to: e.target.value || null })}
                  disabled={!permissions.can_edit}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-navy-900 bg-white focus:outline-none focus:border-gold-400 disabled:bg-gray-50"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <p className="text-xs text-gray-400">
                Created {formatDate(lead.created_at)}
                {lead.created_by ? ` by ${userName.get(lead.created_by) ?? 'a team member'}` : ' from the website'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Main column ── */}
        <div className="space-y-4 md:space-y-6 md:col-start-1 md:row-start-1 min-w-0">

          {/* Notes */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={cardTitle}>Notes</h2>
              {permissions.can_edit && (
                <button onClick={() => setShowEdit(true)} className="text-xs font-medium text-gold-700 hover:underline">
                  {lead.notes ? 'Edit' : 'Add notes'}
                </button>
              )}
            </div>
            {lead.notes ? (
              <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap break-words">{lead.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No notes yet.</p>
            )}
          </div>

          {/* Attachments */}
          <div className={card}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className={`${cardTitle} flex items-center gap-1.5`}>
                <Paperclip size={13} />
                Attachments{attachments?.length ? ` (${attachments.length})` : ''}
              </h2>
              {permissions.can_edit && (
                <div className="flex gap-2">
                  <button
                    onClick={() => cameraInput.current?.click()}
                    disabled={!!uploading}
                    className={`${btn} md:hidden border-gray-200 text-gray-700 hover:bg-gray-50 py-1.5 disabled:opacity-50`}
                  >
                    <Camera size={14} />
                    Photo
                  </button>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={!!uploading}
                    className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50 py-1.5 md:py-1.5 disabled:opacity-50`}
                  >
                    <Upload size={14} />
                    Upload
                  </button>
                  <input ref={fileInput} type="file" multiple hidden onChange={e => uploadFiles(e.target.files)} />
                  <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e => uploadFiles(e.target.files)} />
                </div>
              )}
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                <Loader2 size={14} className="animate-spin" />
                <span className="truncate">Uploading {uploading}…</span>
              </div>
            )}

            {attachments === null ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No files yet. Add photos, plans, or documents from the homeowner.</p>
            ) : (
              <div className="space-y-3">
                {images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {images.map(att => (
                      <div key={att.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-border">
                        {att.url && (
                          <a href={att.url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                            <img src={att.url} alt={att.file_name} className="w-full h-full object-cover" />
                          </a>
                        )}
                        {permissions.can_edit && (
                          <button
                            onClick={() => deleteAttachment(att)}
                            aria-label={`Delete ${att.file_name}`}
                            className="absolute top-1 right-1 bg-black/55 hover:bg-black/75 text-white rounded-full p-1"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {otherFiles.map(att => (
                  <div key={att.id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                    <FileText size={18} className="text-gray-400 shrink-0" />
                    <a
                      href={att.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-sm text-navy-900 hover:underline"
                    >
                      <span className="block truncate">{att.file_name}</span>
                      <span className="text-[11px] text-gray-400">{formatSize(att.size_bytes)}</span>
                    </a>
                    {permissions.can_edit && (
                      <button
                        onClick={() => deleteAttachment(att)}
                        aria-label={`Delete ${att.file_name}`}
                        className="text-gray-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className={card}>
            <h2 className={`${cardTitle} mb-3`}>Activity</h2>

            {permissions.can_create && (
              <form onSubmit={addActivity} className="mb-5 space-y-2">
                <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
                  {LOGGABLE.map(k => {
                    const Icon = KIND_META[k].icon
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={`flex items-center gap-1 shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                          kind === k ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={12} />
                        {KIND_META[k].label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2 items-end">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={KIND_META[kind].placeholder}
                    rows={2}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-300 resize-y focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !note.trim()}
                    className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                  >
                    {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Log
                  </button>
                </div>
              </form>
            )}

            {activities.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No activity yet.</p>
            ) : (
              <ol className="space-y-4">
                {[...activities].reverse().map(act => {
                  const meta = KIND_META[act.kind ?? 'note']
                  const Icon = meta.icon
                  const canRemove = act.created_by === currentUserId || permissions.can_delete
                  return (
                    <li key={act.id} className="flex gap-3">
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        act.kind === 'status' ? 'bg-gray-100 text-gray-500' : 'bg-gold-50 text-gold-700'
                      }`}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          act.kind === 'status' ? 'text-gray-500' : 'text-navy-800'
                        }`}>
                          {act.note}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {act.kind !== 'note' && act.kind !== 'status' && `${meta.label} · `}
                          {userName.get(act.created_by) ?? 'Team member'} · {formatDate(act.created_at)}
                        </p>
                      </div>
                      {canRemove && (
                        <button
                          onClick={() => deleteActivity(act)}
                          aria-label="Delete entry"
                          className="shrink-0 self-start text-gray-300 hover:text-red-600 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <AddLeadModal
          lead={lead}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 bg-red-100 rounded-full p-2">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-navy-900 text-base">Delete this lead?</h2>
                <p className="text-sm text-gray-500 mt-0.5">{lead.title}</p>
              </div>
            </div>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Its notes, activity and attachments are deleted.</li>
              {estimateCount > 0 && (
                <li className="text-red-600 font-medium">
                  {estimateCount === 1 ? 'Its estimate' : `All ${estimateCount} of its estimates`} and any proposals sent from {estimateCount === 1 ? 'it are' : 'them are'} deleted too.
                </li>
              )}
              {lead.converted_job_id && <li>The job created from it stays.</li>}
              <li>This can&apos;t be undone.</li>
            </ul>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteLead}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert-to-Job confirmation dialog */}
      {showConvertConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 bg-green-100 rounded-full p-2">
                <Briefcase size={20} className="text-green-700" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-navy-900 text-base">Convert to Job?</h2>
                <p className="text-sm text-gray-500 mt-0.5">This will create a new job from this lead.</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-border rounded-lg px-4 py-3 space-y-1.5 text-sm">
              <p className="text-navy-800"><span className="text-gray-500 font-medium">Name: </span>{lead.title}</p>
              {lead.client_name && (
                <p className="text-navy-800"><span className="text-gray-500 font-medium">Client: </span>{lead.client_name}</p>
              )}
              {lead.address && (
                <p className="text-navy-800"><span className="text-gray-500 font-medium">Address: </span>{lead.address}</p>
              )}
              {lead.estimated_value != null && (
                <p className="text-navy-800">
                  <span className="text-gray-500 font-medium">Contract value: </span>
                  {formatCurrency(lead.estimated_value)}
                </p>
              )}
            </div>

            <p className="text-xs text-gray-400">
              The job will be created in <strong>Presale</strong> status. You can update its details, address, and team after creation.
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowConvertConfirm(false); setError(null) }}
                disabled={converting}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={convertToJob}
                disabled={converting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {converting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Converting…
                  </>
                ) : (
                  <>
                    <Briefcase size={15} />
                    Create Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
