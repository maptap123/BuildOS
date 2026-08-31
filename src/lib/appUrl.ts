/**
 * Absolute base URL for links that leave the app — texts, calendar files.
 *
 * A relative URL is useless in an SMS, so this falls back to Vercel's injected
 * domain and returns '' only when there is genuinely nothing to build a link
 * from. Callers drop the link in that case rather than sending a broken one.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`

  console.warn('[appUrl] NEXT_PUBLIC_APP_URL is unset — outgoing links will be omitted')
  return ''
}

/** Turns an in-app path into something safe to put in a text message. */
export function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  const base = appUrl()
  return base ? `${base}${pathOrUrl}` : ''
}
