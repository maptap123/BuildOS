'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PasswordInput } from '@/components/auth/PasswordInput'

type Mode = 'signin' | 'reset' | 'reset-sent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/jobs')
      router.refresh()
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not send the reset link. Try again.')
      } else {
        setMode('reset-sent')
      }
    } catch {
      setError('Could not reach BuildOS. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: Mode) {
    setError(null)
    setMode(next)
  }

  const inputClass =
    'w-full border border-border rounded-lg px-3.5 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent'

  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      {/* Header */}
      <div className="flex justify-center pt-16 pb-10">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white tracking-wide">BuildOS</h1>
          <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mt-1">JDC Construction</p>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-start justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
          {mode === 'signin' && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Welcome back</h2>
              <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@jdcremodeling.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs font-medium text-navy-600 hover:text-navy-900 py-1"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {mode === 'reset' && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Reset your password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email and we&apos;ll send you a link to pick a new password.
              </p>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@jdcremodeling.com"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="w-full text-sm font-medium text-navy-600 hover:text-navy-900 py-2"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {mode === 'reset-sent' && (
            <>
              <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Check your email</h2>
              <p className="text-sm text-gray-500 mb-6">
                If <span className="font-medium text-navy-900">{email}</span> has a BuildOS account, a reset
                link is on its way. Open it on this device — it works once.
              </p>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full bg-navy-900 hover:bg-navy-800 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-navy-600 text-xs pb-8">JDC Construction LLC — Internal Use Only</p>
    </div>
  )
}
