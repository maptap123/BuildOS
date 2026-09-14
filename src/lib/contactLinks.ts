/**
 * Tap-to-call / tap-to-text / tap-for-directions link helpers.
 *
 * Field crew tap these with gloves on, in the truck, in the sun. Two rules:
 *  - `tel:` and `sms:` URIs must carry digits only (RFC 3966). Android dialers
 *    and some iOS builds choke on the spaces and parens in "(513) 555-0142".
 *  - Every link that wraps one needs a >=44px tap target.
 */

/**
 * Strip a display phone number down to something a dialer will accept, or null
 * when the field doesn't hold a number worth offering a Call button for.
 *
 * The imported address book is messy: "-", "513", "85-240-1377", and entries
 * like "5133758792 or 5133758791" that hold two numbers in one field. Naively
 * removing non-digits turns that last one into a 20-digit number that dials
 * nothing, so anything longer than a real number is scanned for the first
 * plausible one instead.
 */
export function phoneHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const intl = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return null

  // Explicit country code — trust it, within sane bounds (E.164 allows 15).
  if (intl) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }

  const usable = (d: string): string | null => {
    if (d.length === 10) return `+1${d}`
    if (d.length === 11 && d.startsWith('1')) return `+${d}`
    return null
  }

  const direct = usable(digits)
  if (direct) return direct

  // Too long to be one number ("X or Y", a number plus an extension): take the
  // first run of digits that is a complete number on its own.
  if (digits.length > 11) {
    for (const run of trimmed.match(/\d[\d\s().-]*/g) ?? []) {
      const candidate = usable(run.replace(/[^\d]/g, ''))
      if (candidate) return candidate
    }
    // A long unbroken string of digits — first 11 if it starts with a 1, else 10.
    return usable(digits.slice(0, digits.startsWith('1') ? 11 : 10))
  }

  // Fewer than 10 digits is a fragment, not something to hand a dialer.
  return null
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
