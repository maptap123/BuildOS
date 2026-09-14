'use client'

import { useState } from 'react'
import { Phone, MessageSquare, MapPin, Info, X, User, Hash } from 'lucide-react'
import { telHref, smsHref, directionsHref } from '@/lib/contactLinks'
import type { JobClientContact } from '@/lib/jobClientContact'

interface Props {
  jobNumber: string | null
  jobName: string
  contact: JobClientContact
}

/**
 * Always-present strip inside a job: call the client, text them, or get
 * directions to the site, from any job tab. The Info button opens the full
 * detail sheet. Every target is >=44px — this gets used with gloves on.
 */
export function JobContactBar({ jobNumber, jobName, contact }: Props) {
  const [open, setOpen] = useState(false)

  const tel = telHref(contact.phone)
  const sms = smsHref(contact.phone)
  const maps = directionsHref([contact.address, contact.cityStateZip])

  const fullAddress = [contact.address, contact.cityStateZip]
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <div className="mb-4 rounded-xl border border-border bg-white overflow-hidden">
        {/* Client line — tap anywhere to open the full job info */}
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-3.5 min-h-[48px] text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <User size={15} className="text-gray-400 shrink-0" />
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-navy-900">
            {contact.clientName ?? 'No client on file'}
          </span>
          <span className="flex items-center gap-1 shrink-0 text-[11px] font-semibold text-navy-500">
            <Info size={14} className="text-gold-500" />
            Job Info
          </span>
        </button>

        {/* Full-width thumb targets on a phone; tidy fixed buttons on desktop */}
        <div className="flex items-stretch border-t border-gray-100 divide-x divide-gray-100 md:justify-start">
          <BarAction
            href={tel}
            icon={<Phone size={16} />}
            label="Call"
            disabledLabel="No number"
          />
          <BarAction
            href={sms}
            icon={<MessageSquare size={16} />}
            label="Text"
            disabledLabel="No number"
          />
          <BarAction
            href={maps}
            icon={<MapPin size={16} />}
            label="Directions"
            disabledLabel="No address"
            external
          />
        </div>
      </div>

      {open && (
        <JobInfoSheet
          jobNumber={jobNumber}
          jobName={jobName}
          contact={contact}
          fullAddress={fullAddress}
          tel={tel}
          sms={sms}
          maps={maps}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function BarAction({
  href,
  icon,
  label,
  disabledLabel,
  external,
}: {
  href: string | null
  icon: React.ReactNode
  label: string
  disabledLabel: string
  external?: boolean
}) {
  if (!href) {
    return (
      <span className="flex-1 md:flex-none md:w-40 flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-gray-300 text-[11px] font-semibold">
        {icon}
        {disabledLabel}
      </span>
    )
  }
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex-1 md:flex-none md:w-40 flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-navy-700 font-semibold text-[11px] hover:bg-gold-50/60 active:bg-gold-50 hover:text-gold-700 transition-colors"
    >
      <span className="text-gold-500">{icon}</span>
      {label}
    </a>
  )
}

function JobInfoSheet({
  jobNumber,
  jobName,
  contact,
  fullAddress,
  tel,
  sms,
  maps,
  onClose,
}: {
  jobNumber: string | null
  jobName: string
  contact: JobClientContact
  fullAddress: string
  tel: string | null
  sms: string | null
  maps: string | null
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Job info"
        className="fixed z-50 inset-x-0 bottom-0 rounded-t-2xl bg-white max-h-[85dvh] overflow-y-auto
                   md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:rounded-2xl md:max-h-[70vh] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-navy-900 leading-tight truncate">
              {jobName}
            </h2>
            {jobNumber && (
              <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                <Hash size={11} />
                {jobNumber}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close job info"
            className="shrink-0 flex items-center justify-center w-11 h-11 -mr-2 -mt-2 rounded-lg text-gray-400 hover:text-navy-900 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="px-5 py-4 space-y-4"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          <Field label="Client">
            <p className="text-sm font-semibold text-navy-900">
              {contact.clientName ?? <span className="text-gray-400 italic font-normal">Not on file</span>}
            </p>
          </Field>

          <Field label="Phone">
            {tel && sms ? (
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={tel}
                  className="flex items-center gap-2 -ml-2 px-2 min-h-[44px] rounded-lg text-sm font-semibold text-navy-800 hover:text-gold-600 hover:bg-gold-50/60 active:bg-gold-50 transition-colors"
                >
                  <Phone size={16} className="text-gold-500 shrink-0" />
                  {contact.phone}
                </a>
                <a
                  href={sms}
                  className="flex items-center shrink-0 px-4 min-h-[44px] rounded-xl border border-navy-200 text-xs font-semibold text-navy-600 hover:border-navy-400 hover:bg-navy-50 active:bg-navy-100 transition-colors"
                >
                  Text
                </a>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No number on file</p>
            )}
            {contact.phoneSource === 'name_match' && (
              <p className="text-[11px] text-gray-400 mt-1">
                From the contact matching this client&apos;s name.
              </p>
            )}
          </Field>

          <Field label="Site address">
            {maps ? (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 -ml-2 px-2 py-2 min-h-[44px] rounded-lg text-sm text-navy-800 hover:text-gold-600 hover:bg-gold-50/60 active:bg-gold-50 transition-colors"
              >
                <MapPin size={16} className="mt-0.5 text-gold-500 shrink-0" />
                <span className="leading-relaxed">
                  {contact.address}
                  {contact.cityStateZip && <><br />{contact.cityStateZip}</>}
                </span>
              </a>
            ) : (
              <p className="text-sm text-gray-400 italic">No site address on file</p>
            )}
            {maps && (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 active:bg-navy-950 transition-colors"
              >
                <MapPin size={16} className="text-gold-400" />
                Open in Google Maps
              </a>
            )}
          </Field>

          {fullAddress && (
            <p className="sr-only">{fullAddress}</p>
          )}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      {children}
    </div>
  )
}
