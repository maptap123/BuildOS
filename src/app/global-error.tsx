'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Catches errors that escape every route's own error.tsx (including the root
// layout itself) so they still reach Sentry instead of just showing Next's blank
// crash screen. Replaces the whole document when triggered — must render <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-surface font-sans">
        <div className="text-center px-6">
          <p className="font-display text-xl font-bold text-navy-900 mb-2">Something went wrong</p>
          <p className="text-sm text-gray-500 mb-5">The error has been reported. Try reloading the page.</p>
          <button
            onClick={reset}
            className="text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 px-4 py-2 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
