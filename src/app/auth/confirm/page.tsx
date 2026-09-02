import { ConfirmForm } from '@/components/auth/ConfirmForm'

export const metadata = {
  title: 'Accept your BuildOS invite',
}

/**
 * Where every emailed auth link lands.
 *
 * Deliberately a page that asks for a tap, not a handler that verifies on sight.
 * Supabase tokens are single-use, and anything that fetches a URL spends one:
 * SMS and chat apps fetch links to build previews, mail providers scan them for
 * malware, chat clients unfurl them. Verifying inside GET meant the preview
 * fetcher redeemed the invite seconds after it was generated, and the person it
 * was sent to got "this link has already been used".
 *
 * Confirmed in production 2026-09-02: a link minted at 15:19:31 was spent at
 * 15:19:38 — seven seconds, before it could plausibly have been opened by hand.
 *
 * A preview fetcher issues a GET and stops. It does not submit forms. So the
 * token now survives until a person presses Continue.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string
    type?: string
    code?: string
    next?: string
    error?: string
    error_description?: string
  }>
}) {
  const params = await searchParams

  return (
    <ConfirmForm
      tokenHash={params.token_hash ?? null}
      type={params.type ?? null}
      code={params.code ?? null}
      next={params.next ?? null}
      upstreamError={params.error_description ?? params.error ?? null}
    />
  )
}
