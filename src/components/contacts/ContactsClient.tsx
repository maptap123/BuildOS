'use client'

import { useState, useMemo } from 'react'
import { UserPlus, Search, Star, Phone, Mail, Briefcase, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { AddContactModal } from './AddContactModal'
import type { Contact } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  initialContacts: Contact[]
  permissions: Permissions
}

export function ContactsClient({ initialContacts, permissions }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>()
    contacts.forEach(c => {
      if (c.job_id && c.jobs?.name) seen.set(c.job_id, c.jobs.name)
    })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return contacts.filter(c => {
      const matchesSearch =
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.jobs?.name ?? '').toLowerCase().includes(q)
      const matchesJob = !jobFilter || c.job_id === jobFilter
      return matchesSearch && matchesJob
    })
  }, [contacts, search, jobFilter])

  function handleSaved(saved: Contact) {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => a.full_name.localeCompare(b.full_name))
      }
      return [...prev, saved].sort((a, b) => a.full_name.localeCompare(b.full_name))
    })
    setShowAdd(false)
    setEditContact(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this contact? This cannot be undone.')) return
    setError(null)
    try {
      const res = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete contact')
      }
      setContacts(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contact')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-navy-900 text-xl leading-tight">Contacts</h1>
          <p className="text-xs text-gray-400 mt-0.5">{contacts.length} total</p>
        </div>
        {permissions.can_create && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shrink-0"
          >
            <UserPlus size={15} />
            Add Contact
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
          />
        </div>
        {jobOptions.length > 0 && (
          <select
            value={jobFilter}
            onChange={e => setJobFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 bg-white"
          >
            <option value="">All jobs</option>
            {jobOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-gray-400">
            {contacts.length === 0
              ? 'No contacts yet. Add your first contact to get started.'
              : 'No contacts match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Contact</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Job</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(contact => (
                <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-navy-700">
                          {contact.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-navy-900 truncate">{contact.full_name}</span>
                          {contact.is_primary && (
                            <Star size={12} className="text-gold-500 fill-gold-400 shrink-0" />
                          )}
                        </div>
                        {contact.jobs?.name && (
                          <p className="text-xs text-gray-400 truncate md:hidden mt-0.5">
                            <Briefcase size={10} className="inline mr-1" />
                            {contact.jobs.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="space-y-0.5">
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone size={11} className="text-gray-400 shrink-0" />
                          <span>{contact.phone}</span>
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Mail size={11} className="text-gray-400 shrink-0" />
                          <a href={`mailto:${contact.email}`} className="hover:text-navy-900 truncate max-w-[180px]">
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {!contact.phone && !contact.email && (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {contact.jobs?.name ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Briefcase size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-[160px]">{contact.jobs.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {permissions.can_edit && (
                        <button
                          onClick={() => setEditContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit contact"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {permissions.can_delete && (
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete contact"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddContactModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}

      {editContact && (
        <AddContactModal
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
