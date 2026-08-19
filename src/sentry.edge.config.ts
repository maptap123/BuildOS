import * as Sentry from '@sentry/nextjs'

// Covers proxy.ts (Next's edge middleware) and any edge-runtime route handlers.
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})
