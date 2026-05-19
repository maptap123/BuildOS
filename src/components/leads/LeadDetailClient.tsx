'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  User,
  Edit2,
  Briefcase,
  AlertCircle,
  Send,
} from 'lucide-react'
import { AddLeadModal } from './AddLeadModal'
import type { Lead, LeadActivity, LeadStatus, LeadSource } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  lead: Lead
  initialActivities: LeadActivity[]
  permissions: Permissions
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new:       'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  proposal:  'bg-yellow-100 text-yellow-700',
  won:       'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-700',
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

export function LeadDetailClient({ lead: initialLead, initialActivities, permissions }: Props) {
  const router = useRouter()
  const [lead, setLead] = useState<Lead>(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>(initialActivities)
  const [showEdit, setShowEdit] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setSavingNote(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/activities`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: note.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to add note')
      }
      const saved: LeadActivity = await res.json()
      setActivities(prev => [...prev, saved])
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  function handleSaved(saved: Lead) {
    setLead(saved)
    setShowEdit(false)
  }

  const canConvert = lead.status === 'won' && !lead.converted_job_id

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Back + header */}
      <div>
        <button
          onClick={() => router.push('/leads')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-900 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          Back to Leads
        </button>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-navy-900 text-2xl leading-tight">{lead.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[lead.status]}`}>
                {STATUS_LABELS[lead.status]}
              </span>
              {lead.estimated_value != null && (
                <span className="text-sm font-semibold text-green-700">
                  {formatCurrency(lead.estimated_value)}
                </span>
              )}
              {lead.source && (
                <span className="text-xs bg-navy-50 text-navy-600 px-2 py-0.5 rounded-full">
                  {SOURCE_LABELS[lead.source]}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canConvert && (
              <button
                onClick={() => alert('Convert to Job — Coming soon')}
                className="flex items-center gap-1.5 border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Briefcase size={14} />
                Convert to Job
              </button>
            )}
            {permissions.can_edit && (
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Edit2 size={14} />
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Contact info card */}
      <div className="bg-white border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Information</h2>

        {lead.client_name && (
          <div className="flex items-center gap-3">
            <User size={15} className="text-gray-400 shrink-0" />
            <span className="text-sm text-navy-900">{lead.client_name}</span>
          </div>
        )}
        {lead.client_email && (
          <div className="flex items-center gap-3">
            <Mail size={15} className="text-gray-400 shrink-0" />
            <a href={`mailto:${lead.client_email}`} className="text-sm text-blue-600 hover:underline">
              {lead.client_email}
            </a>
          </div>
        )}
        {lead.client_phone && (
          <div className="flex items-center gap-3">
            <Phone size={15} className="text-gray-400 shrink-0" />
            <a href={`tel:${lead.client_phone}`} className="text-sm text-navy-900 hover:underline">
              {lead.client_phone}
            </a>
          </div>
        )}
        {lead.address && (
          <div className="flex items-center gap-3">
            <MapPin size={15} className="text-gray-400 shrink-0" />
            <span className="text-sm text-navy-900">{lead.address}</span>
          </div>
        )}

        {!lead.client_name && !lead.client_email && !lead.client_phone && !lead.address && (
          <p className="text-sm text-gray-400 italic">No contact information added.</p>
        )}
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notes</h2>
          <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
        </div>
      )}

      {/* Activity feed */}
      <div className="bg-white border border-border rounded-xl p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Activity Log</h2>

        {activities.length === 0 && (
          <p className="text-sm text-gray-400 italic mb-4">No activity yet. Add a note below.</p>
        )}

        <div className="space-y-3 mb-5">
          {activities.map(act => (
            <div key={act.id} className="border-l-2 border-gold-200 pl-4 py-0.5">
              <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap">{act.note}</p>
              <p className="text-[10px] text-gray-400 mt-1">{formatDate(act.created_at)}</p>
            </div>
          ))}
        </div>

        {/* Add note */}
        {permissions.can_create && (
          <form onSubmit={addNote} className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a follow-up note…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
            <button
              type="submit"
              disabled={savingNote || !note.trim()}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Send size={14} />
              {savingNote ? '…' : 'Add'}
            </button>
          </form>
        )}
      </div>

      {/* Meta */}
      <p className="text-xs text-gray-400 text-right">
        Created {formatDate(lead.created_at)}
        {lead.updated_at !== lead.created_at && ` · Updated ${formatDate(lead.updated_at)}`}
      </p>

      {showEdit && (
        <AddLeadModal
          lead={lead}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
