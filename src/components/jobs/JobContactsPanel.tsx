'use client'

import { useState } from 'react'
import { Phone, Mail, Star, UserPlus, Users } from 'lucide-react'
import { AddContactModal } from '@/components/contacts/AddContactModal'
import type { Contact } from '@/types'

interface Props {
  jobId: string
  initialContacts: Contact[]
  canCreate: boolean
}

export function JobContactsPanel({ jobId, initialContacts, canCreate }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [showAdd, setShowAdd] = useState(false)

  function handleSaved(saved: Contact) {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
          return a.full_name.localeCompare(b.full_name)
        })
      }
      return [...prev, saved].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
        return a.full_name.localeCompare(b.full_name)
      })
    })
    setShowAdd(false)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-navy-900 text-base">
            Contacts
            {contacts.length > 0 && (
              <span className="ml-2 text-xs font-sans font-normal text-gray-400">{contacts.length}</span>
            )}
          </h3>
          {canCreate && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 border border-gold-400 text-gold-600 hover:bg-gold-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <UserPlus size={12} />
              Add Contact
            </button>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <Users size={28} className="text-gray-200" />
            No contacts linked to this job
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map(contact => (
              <div
                key={contact.id}
                className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0"
              >
                <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-navy-700">
                    {contact.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-navy-900 truncate">{contact.full_name}</span>
                    {contact.is_primary && (
                      <Star size={11} className="text-gold-500 fill-gold-400 shrink-0" />
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-navy-900 transition-colors"
                      >
                        <Phone size={11} className="text-gray-400 shrink-0" />
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-navy-900 transition-colors"
                      >
                        <Mail size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    )}
                    {!contact.phone && !contact.email && (
                      <span className="text-xs text-gray-300">No contact info</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddContactModal
          defaultJobId={jobId}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
