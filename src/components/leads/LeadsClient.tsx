'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, AlertCircle } from 'lucide-react'
import { AddLeadModal } from './AddLeadModal'
import type { Lead, LeadStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  initialLeads: Lead[]
  permissions: Permissions
}

const COLUMNS: { key: LeadStatus; label: string; color: string }[] = [
  { key: 'new',       label: 'New',       color: 'bg-gray-100 text-gray-700'    },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-100 text-blue-700'    },
  { key: 'proposal',  label: 'Proposal',  color: 'bg-yellow-100 text-yellow-700' },
  { key: 'won',       label: 'Won',       color: 'bg-green-100 text-green-700'  },
  { key: 'lost',      label: 'Lost',      color: 'bg-red-100 text-red-700'      },
]

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LeadsClient({ initialLeads, permissions }: Props) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function leadsForStatus(status: LeadStatus) {
    return leads.filter(l => l.status === status)
  }

  function columnTotal(status: LeadStatus): number {
    return leadsForStatus(status).reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)
  }

  async function moveStatus(lead: Lead, newStatus: LeadStatus) {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l))
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: lead.id, status: newStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update status')
      }
      const updated: Lead = await res.json()
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    } catch (e) {
      // Revert
      setLeads(prev => prev.map(l => l.id === lead.id ? lead : l))
      setError(e instanceof Error ? e.message : 'Failed to update lead')
    }
  }

  function handleSaved(saved: Lead) {
    setLeads(prev => {
      const exists = prev.find(l => l.id === saved.id)
      if (exists) return prev.map(l => l.id === saved.id ? saved : l)
      return [saved, ...prev]
    })
    setShowAdd(false)
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-navy-900 text-xl">Leads Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} lead{leads.length !== 1 ? 's' : ''} total</p>
        </div>
        {permissions.can_create && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Lead
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Kanban board — horizontal scroll on mobile */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {COLUMNS.map(col => {
          const colLeads = leadsForStatus(col.key)
          const total = columnTotal(col.key)

          return (
            <div
              key={col.key}
              className="flex-shrink-0 w-72 md:flex-1 md:min-w-0 bg-gray-50 rounded-xl border border-border flex flex-col"
            >
              {/* Column header */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs font-medium text-gray-500">{colLeads.length}</span>
                </div>
                <p className="text-xs text-gray-400">{formatCurrency(total)}</p>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
                {colLeads.length === 0 && (
                  <p className="text-center text-xs text-gray-300 py-6">No leads</p>
                )}

                {colLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="bg-white rounded-lg border border-border p-3 cursor-pointer hover:border-gold-300 hover:shadow-sm transition-all group"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <p className="text-sm font-semibold text-navy-900 leading-snug group-hover:text-gold-600 transition-colors line-clamp-2">
                      {lead.title}
                    </p>

                    {lead.client_name && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{lead.client_name}</p>
                    )}

                    {lead.estimated_value != null && (
                      <p className="text-xs font-semibold text-green-700 mt-1.5">
                        {formatCurrency(lead.estimated_value)}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-gray-400">{formatDate(lead.created_at)}</span>

                      {/* Status mover — stop propagation so it doesn't navigate */}
                      {permissions.can_edit && (
                        <select
                          value={lead.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation()
                            moveStatus(lead, e.target.value as LeadStatus)
                          }}
                          className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-gray-600 focus:outline-none focus:border-gold-400 bg-white"
                        >
                          {COLUMNS.map(c => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <AddLeadModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
