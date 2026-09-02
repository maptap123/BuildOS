'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Stage = 'checking' | 'ready' | 'saving' | 'expired'

const MIN_PASSWORD = 8

interface Problem {
  title: string
  detail: string
  hint: string
}

/**
 * Turns Supabase's error codes into something a framer reads once and acts on.
 *
 * A banned account has to be split out from a stale link. Both arrive here as a
 * failed verification, but "ask for a new link" is useless advice when the
 * account has been removed — a fresh link fails exactly the same way, and the
 * office ends up re-sending links that could never work.
 */
function friendlyError(raw: string | null): Problem {
  const text = (raw ?? '').toLowerCase()

  if (text.includes('banned') || text.includes('user_banned')) {
    return {
      title: 'This account has been removed',
      detail: 'Your BuildOS access was turned off, so this link cannot sign you in.',
      hint: 'Ask the JDC office to restore your account in Admin → Users, then open this link again. A new link will not help until they do.',
    }
  }

  if (text.includes('expired') || text.includes('otp_expired')) {
    return {
      title: 'This link has already been used',
      detail: 'Invite links work once and time out after 24 hours.',
      hint: 'Ask the JDC office to send you a new one, then open it on this device.',
    }
  }

  return {
    title: 'This link is no longer valid',
    detail: raw?.trim() || 'We could not verify that invite link.',
    hint: 'Ask the JDC office to send you a new one, then open it on this device.',
  }
}

export function WelcomeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read the fragment during the first render, before anything can scrub it.
  // Draining it inside the effect instead would lose it whenever React runs that
  // effect twice — the second pass finds a clean URL and reports a good link as
  // expired.
  const [initialHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')
  )
  const startedRef = useRef(false)

  const [stage, setStage] = useState<Stage>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const fail = useCallback((message: string | null) => {
    setProblem(friendlyError(message))
    setStage('expired')
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const supabase = createClient()

    async function establishSession() {
      // /auth/confirm forwards its failures as a query param.
      const queryError = searchParams.get('error')
      if (queryError) {
        fail(queryError)
        return
      }

      // Supabase's own mailer returns the session — or the failure — in the URL
      // fragment, which never reaches the server. Drain what we captured at
      // render, then scrub the address bar so the token isn't left in history or
      // read off a shared screen.
      if (initialHash) {
        const fragment = new URLSearchParams(initialHash)
        history.replaceState(null, '', window.location.pathname + window.location.search)

        const hashError = fragment.get('error_description') ?? fragment.get('error')
        if (hashError) {
          fail(hashError)
          return
        }

        const accessToken = fragment.get('access_token')
        const refreshToken = fragment.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) {
            fail(error.message)
            return
          }
        }
      }

      const { data, error } = await supabase.auth.getUser()

      if (error || !data.user) {
        fail('access_denied')
        return
      }

      setEmail(data.user.email ?? null)
      setStage('ready')
    }

    establishSession()
  }, [searchParams, fail, initialHash])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (password.length < MIN_PASSWORD) {
      setFormError(`Use at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (password !== confirm) {
      setFormError('The two passwords do not match.')
      return
    }

    setStage('saving')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setFormError(error.message)
      setStage('ready')
      return
    }

    router.push('/jobs')
    router.refresh()
  }

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
          {stage === 'checking' && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Checking your invite…</h2>
              <p className="text-sm text-gray-500">One moment.</p>
            </>
          )}

          {stage === 'expired' && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{problem?.title}</h2>
              <p className="text-sm text-gray-500 mb-4">{problem?.detail}</p>
              <p className="text-sm text-gray-500 mb-6">{problem?.hint}</p>
              <a
                href="/login"
                className="block text-center w-full bg-navy-900 hover:bg-navy-800 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                Go to sign in
              </a>
            </>
          )}

          {(stage === 'ready' || stage === 'saving') && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Set your password</h2>
              <p className="text-sm text-gray-500 mb-6">
                {email ? <>You&apos;re signing in as <span className="font-medium text-navy-900">{email}</span>.</> : 'Pick a password to finish setting up your account.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    New password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
                  />
                </div>

                {formError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={stage === 'saving'}
                  className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {stage === 'saving' ? 'Saving…' : 'Save and continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-navy-600 text-xs pb-8">JDC Construction LLC — Internal Use Only</p>
    </div>
  )
}
