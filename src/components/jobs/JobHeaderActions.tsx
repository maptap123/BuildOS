import { MapPin, Phone } from 'lucide-react'
import { directionsHref, telHref } from '@/lib/contactLinks'

interface Props {
  phone: string | null
  address: string | null
  cityStateZip: string | null
}

/** Quick actions beside the job title, shared by every job tab. */
export function JobHeaderActions({ phone, address, cityStateZip }: Props) {
  const maps = directionsHref([address, cityStateZip])
  const tel = telHref(phone)
  const actionClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-navy-700 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 transition-colors'
  const disabledClass = `${actionClass} cursor-not-allowed text-gray-400 disabled:hover:bg-transparent`

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Job quick actions" role="group">
      {maps ? (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={actionClass} title="Open job address in Google Maps">
          <MapPin size={16} aria-hidden="true" />
          Google Maps
        </a>
      ) : (
        <button type="button" disabled className={disabledClass} title="No job address on file">
          <MapPin size={16} aria-hidden="true" />
          No address
        </button>
      )}
      {tel ? (
        <a href={tel} className={actionClass} title="Call homeowner">
          <Phone size={16} aria-hidden="true" />
          Call homeowner
        </a>
      ) : (
        <button type="button" disabled className={disabledClass} title="No homeowner phone number on file">
          <Phone size={16} aria-hidden="true" />
          No number
        </button>
      )}
    </div>
  )
}
