import * as Sentry from '@sentry/nextjs'

// No-ops safely when SENTRY_DSN is unset (local dev, or before the Sentry project exists).
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})
