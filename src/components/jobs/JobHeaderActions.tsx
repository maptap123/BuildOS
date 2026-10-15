import { MapPin, Phone } from 'lucide-react'
import { directionsHref, telHref } from '@/lib/contactLinks'

interface Props {
  phone: string | null
  address: string | null
  cityStateZip: string | null
  compact?: boolean
  variant?: 'light' | 'dark'
}

/** Quick actions beside the job title, shared by every job tab. */
export function JobHeaderActions({ phone, address, cityStateZip, compact = false, variant = 'light' }: Props) {
  const maps = directionsHref([address, cityStateZip])
  const tel = telHref(phone)
  const actionClass = `inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-lg border text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors ${compact ? 'p-2' : 'px-3'} ${variant === 'dark' ? 'border-white/20 text-white hover:bg-white/10 focus-visible:outline-white' : 'border-border text-navy-700 hover:bg-gold-50 focus-visible:outline-navy-600'}`
  const disabledClass = `${actionClass} cursor-not-allowed opacity-40 disabled:hover:bg-transparent`

  return (
    <div className={`flex shrink-0 items-center ${compact ? 'gap-1' : 'flex-wrap gap-2'}`} aria-label="Job quick actions" role="group">
      {maps ? (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={actionClass} title="Open job address in Google Maps" aria-label="Open job address in Google Maps">
          <MapPin size={16} aria-hidden="true" />
          {!compact && 'Google Maps'}
        </a>
      ) : (
        <button type="button" disabled className={disabledClass} title="No job address on file" aria-label="No job address on file">
          <MapPin size={16} aria-hidden="true" />
          {!compact && 'No address'}
        </button>
      )}
      {tel ? (
        <a href={tel} className={actionClass} title="Call homeowner" aria-label="Call homeowner">
          <Phone size={16} aria-hidden="true" />
          {!compact && 'Call homeowner'}
        </a>
      ) : (
        <button type="button" disabled className={disabledClass} title="No homeowner phone number on file" aria-label="No homeowner phone number on file">
          <Phone size={16} aria-hidden="true" />
          {!compact && 'No number'}
        </button>
      )}
    </div>
  )
}
