'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Loader2 } from 'lucide-react'

interface Props {
  jobId: string
  /** The job's linked lead, if it already has one. */
  leadId: string | null
}

/**
 * Opens the estimate builder for a job. Jobs without a linked lead get one
 * created on the way through — estimates are stored against leads.
 */
export function StartEstimateButton({ jobId, leadId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (leadId) {
      router.push(`/leads/${leadId}/estimate`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/estimate-lead`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      router.push(`/leads/${data.lead_id}/estimate`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={start}
        disabled={loading}
        className="inline-flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
        {loading ? 'Opening builder…' : 'Start an Estimate'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
