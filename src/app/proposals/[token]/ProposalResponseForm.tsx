'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

interface Props {
  token: string
}

type Result = {
  status: 'approved' | 'rejected'
  public_token: string
  client_approved_at: string | null
  client_rejected_at: string | null
  conversion?: {
    job?: {
      id: string
      job_number: string
      name: string
    }
    budget_lines_created: number
    schedule_items_created: number
  }
}

export function ProposalResponseForm({ token }: Props) {
  const [clientName, setClientName] = useState('')
  const [clientSignature, setClientSignature] = useState('')
  const [clientResponseNote, setClientResponseNote] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(action)
    setError('')

    try {
      const res = await fetch(`/api/proposals/client/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          client_name: clientName,
          client_signature: clientSignature,
          client_response_note: clientResponseNote,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Something went wrong')
      }

      setResult({
        status: data.status,
        public_token: data.public_token,
        client_approved_at: data.client_approved_at,
        client_rejected_at: data.client_rejected_at,
        conversion: data.conversion,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  if (result?.status === 'approved') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle className="text-green-500" size={48} />
        <p className="text-xl font-semibold text-green-700">Proposal Accepted</p>
        <p className="text-sm text-gray-500">
          Thank you. Your acceptance has been recorded.
        </p>
        {result.conversion?.job && (
          <p className="text-sm text-gray-500">
            Job {result.conversion.job.job_number} has been created for {result.conversion.job.name}.
          </p>
        )}
      </div>
    )
  }

  if (result?.status === 'rejected') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <XCircle className="text-red-400" size={48} />
        <p className="text-xl font-semibold text-red-600">Proposal Declined</p>
        <p className="text-sm text-gray-500">Your response has been recorded. We will be in touch.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-center">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</span>
          <input
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#0f2a4a] focus:ring-2 focus:ring-blue-100"
            placeholder="Full name"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Signature</span>
          <input
            value={clientSignature}
            onChange={e => setClientSignature(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#0f2a4a] focus:ring-2 focus:ring-blue-100"
            placeholder="Type your name"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</span>
        <textarea
          value={clientResponseNote}
          onChange={e => setClientResponseNote(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#0f2a4a] focus:ring-2 focus:ring-blue-100"
          placeholder="Optional"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={() => handleAction('reject')}
          disabled={loading !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {loading === 'reject' ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
          Decline
        </button>
        <button
          onClick={() => handleAction('approve')}
          disabled={loading !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {loading === 'approve' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          Accept Proposal
        </button>
      </div>
    </div>
  )
}
