interface Props {
  tokenHash: string | null
  type: string | null
  code: string | null
  next: string | null
  upstreamError: string | null
}

/**
 * The "press Continue" step that keeps link previewers from spending the token.
 *
 * A plain server-rendered form on purpose: no client JavaScript, nothing that
 * auto-submits, and no fetch on mount. Anything that would redeem the invite
 * without a person deciding to defeats the point of the page.
 */
export function ConfirmForm({ tokenHash, type, code, next, upstreamError }: Props) {
  const hasToken = Boolean(tokenHash && type) || Boolean(code)

  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <div className="flex justify-center pt-16 pb-10">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white tracking-wide">BuildOS</h1>
          <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mt-1">JDC Construction</p>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
          {upstreamError || !hasToken ? (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">
                This link is missing something
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {upstreamError
                  ? 'The link came through damaged or has already been used.'
                  : 'It looks like only part of the link was copied across.'}{' '}
                Ask the JDC office to send you a new one.
              </p>
              <a
                href="/login"
                className="block text-center w-full bg-navy-900 hover:bg-navy-800 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                Go to sign in
              </a>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">
                You&apos;re invited to BuildOS
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Tap continue and pick a password. It takes about a minute.
              </p>

              <form action="/auth/confirm/verify" method="POST">
                {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}
                {type && <input type="hidden" name="type" value={type} />}
                {code && <input type="hidden" name="code" value={code} />}
                {next && <input type="hidden" name="next" value={next} />}
                <button
                  type="submit"
                  className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  Continue
                </button>
              </form>

              <p className="text-xs text-gray-400 mt-4 text-center">
                This link works once and expires 24 hours after it was sent.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-navy-600 text-xs pb-8">JDC Construction LLC — Internal Use Only</p>
    </div>
  )
}
