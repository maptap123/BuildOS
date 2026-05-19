'use client'

import { useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

interface Props {
  token: string
  status: string
}

export function ApprovalButtons({ token, status }: Props) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState('')

  if (status !== 'submitted' && result === null) return null

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(action)
    setError('')
    try {
      const res = await fetch(`/api/change-orders/client/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Something went wrong')
      }
      setResult(action === 'approve' ? 'approved' : 'rejected')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  if (result === 'approved') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle className="text-green-500" size={48} />
        <p className="text-xl font-semibold text-green-700">Change Order Approved</p>
        <p className="text-sm text-gray-500">Thank you. Your approval has been recorded.</p>
      </div>
    )
  }

  if (result === 'rejected') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <XCircle className="text-red-400" size={48} />
        <p className="text-xl font-semibold text-red-600">Change Order Declined</p>
        <p className="text-sm text-gray-500">Your response has been recorded. We will be in touch.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 w-full text-center">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => handleAction('reject')}
          disabled={loading !== null}
          className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-red-300 text-red-600 font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading === 'reject' ? (
            <span className="inline-block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <XCircle size={18} />
          )}
          Decline
        </button>
        <button
          onClick={() => handleAction('approve')}
          disabled={loading !== null}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors shadow-sm disabled:opacity-50"
        >
          {loading === 'approve' ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          Approve Change Order
        </button>
      </div>
    </div>
  )
}
