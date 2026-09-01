import { Suspense } from 'react'
import { WelcomeClient } from '@/components/auth/WelcomeClient'

export const metadata = {
  title: 'Welcome to BuildOS',
}

/**
 * Where an accepted invite lands. Kept public in the proxy: the visitor has no
 * session until /auth/confirm sets one, and a redirect to /login here would drop
 * the URL fragment Supabase's own mailer puts the session in.
 */
export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy-900" />}>
      <WelcomeClient />
    </Suspense>
  )
}
