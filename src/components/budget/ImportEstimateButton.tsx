'use client'

import { useState } from 'react'
import { Download, X, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Estimate } from '@/types'

interface Props {
  jobId: string
  estimate: Pick<Estimate, 'id' | 'title' | 'version'>
  lineCount: number
}

export function ImportEstimateButton({ jobId, estimate, lineCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState<{ existing_count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doImport(force = false) {
    setLoading(true)
    setError(null)
    try {
      const url = force
        ? `/api/budget/import-estimate?force=true`
        : `/api/budget/import-estimate`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, estimate_id: estimate.id }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setConflict({ existing_count: data.existing_count })
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setOpen(false)
      setConflict(null)
      router.push(`/jobs/${jobId}/budget`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const title = estimate.title ?? `Estimate v${estimate.version}`

  return (
    <>
      <button
        onClick={() => { setOpen(true); setConflict(null); setError(null) }}
        className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 border border-gray-200 hover:border-gold-400 hover:text-gold-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download size={13} />
        Import to Budget
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-display font-semibold text-navy-900 text-base">Import Estimate to Budget</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {conflict ? (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-amber-900">
                      This job already has {conflict.existing_count} budget line{conflict.existing_count !== 1 ? 's' : ''}.
                    </p>
                    <p className="text-amber-700 text-xs">
                      Importing will delete all existing lines and replace them with {lineCount} lines from &ldquo;{title}&rdquo;.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  This will create <strong>{lineCount} budget line{lineCount !== 1 ? 's' : ''}</strong> from{' '}
                  <strong>&ldquo;{title}&rdquo;</strong> using raw cost (quantity &times; unit cost, before markup).
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                {conflict ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => doImport(true)}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {loading ? 'Importing…' : 'Overwrite & Import'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => doImport(false)}
                    className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {loading ? 'Importing…' : 'Import'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
