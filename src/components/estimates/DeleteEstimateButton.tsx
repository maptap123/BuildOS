'use client'

import { useState, useRef, useId } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle, X } from 'lucide-react'
import type { Estimate } from '@/types'

interface Props {
  estimate: Pick<Estimate, 'id' | 'title' | 'version'>
  onDeleted?: (id: string) => void
  disabled?: boolean
}

/**
 * Confirmation modal + DELETE call for a single estimate.
 * Always shows title AND a separate "Version N" line.
 * Guards against double-clicks via in-flight ref.
 * Calls router.refresh() after deletion so server data stays in sync.
 */
export function DeleteEstimateButton({ estimate, onDeleted, disabled = false }: Props) {
  const router                          = useRouter()
  const [open, setOpen]                 = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const inFlight                        = useRef(false)
  const titleId                         = useId()

  const displayTitle = estimate.title?.trim() || 'Untitled Estimate'

  function openModal() {
    setError(null)
    setOpen(true)
  }
  function closeModal() {
    if (deleting) return
    setOpen(false)
    setError(null)
  }

  async function confirmDelete() {
    if (inFlight.current || disabled) return
    inFlight.current = true
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}`, { method: 'DELETE' })
      if (res.status === 204) {
        setOpen(false)
        router.refresh()
        onDeleted?.(estimate.id)
        return
      }
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Unexpected status ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete estimate')
    } finally {
      setDeleting(false)
      inFlight.current = false
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        title="Delete this estimate"
        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 size={12} />
        Delete
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500 shrink-0" />
                <h2 id={titleId} className="font-display font-bold text-navy-900 text-base">Delete Estimate</h2>
              </div>
              <button
                aria-label="Close delete confirmation"
                onClick={closeModal}
                disabled={deleting}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              <div className="text-sm text-gray-700 space-y-0.5">
                <p>Permanently delete <strong className="text-navy-900">&ldquo;{displayTitle}&rdquo;</strong>?</p>
                <p className="text-xs text-gray-400">Version {estimate.version}</p>
              </div>

              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700 space-y-1">
                <p className="font-semibold">This action cannot be undone.</p>
                <p>All line items on this estimate will be permanently removed.</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={closeModal}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || disabled}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete Estimate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
