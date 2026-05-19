'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
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

  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      {/* Header */}
      <div className="flex justify-center pt-16 pb-10">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white tracking-wide">JDC</h1>
          <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mt-1">Platform</p>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-start justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
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
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@jdcremodeling.com"
                className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
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
        </div>
      </div>

      <p className="text-center text-navy-600 text-xs pb-8">JDC Construction LLC — Internal Use Only</p>
    </div>
  )
}
