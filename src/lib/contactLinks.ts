/**
 * Tap-to-call / tap-to-text / tap-for-directions link helpers.
 *
 * Field crew tap these with gloves on, in the truck, in the sun. Two rules:
 *  - `tel:` and `sms:` URIs must carry digits only (RFC 3966). Android dialers
 *    and some iOS builds choke on the spaces and parens in "(513) 555-0142".
 *  - Every link that wraps one needs a >=44px tap target.
 */

/** Strip a display phone number down to something a dialer will accept. */
export function phoneHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Keep a leading + for international, digits everywhere else.
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return null
  const intl = trimmed.startsWith('+')
  if (intl) return `+${digits}`
  // Bare 10-digit US numbers dial more reliably with the country code.
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return digits
}

export function telHref(raw: string | null | undefined): string | null {
  const n = phoneHref(raw)
  return n ? `tel:${n}` : null
}

export function smsHref(raw: string | null | undefined): string | null {
  const n = phoneHref(raw)
  return n ? `sms:${n}` : null
}

/**
 * Turn-by-turn directions from wherever the crew is standing.
 * Returns null when there is no address worth opening a map for.
 */
export function directionsHref(
  parts: (string | null | undefined)[],
): string | null {
  const address = parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ')
  if (!address) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
