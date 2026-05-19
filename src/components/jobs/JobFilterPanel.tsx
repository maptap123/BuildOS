'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Star, X } from 'lucide-react'
import type { JobStatus } from '@/types'
import type { UserOption } from '@/hooks/useUsers'

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'lead',     label: 'Lead'     },
  { value: 'presale',  label: 'Presale'  },
  { value: 'active',   label: 'Active'   },
  { value: 'closed',   label: 'Closed'   },
  { value: 'archived', label: 'Archived' },
]

interface Props {
  open: boolean
  onClose: () => void
  activeStatus: JobStatus | ''
  activeTags: string[]
  availableTags: string[]
  activeManager: string | null
  availableManagers: UserOption[]
  defaultStatus?: JobStatus | ''
  defaultTags?: string[]
  onApply: (status: JobStatus | '', tags: string[], manager: string | null) => void
  onClear: () => void
  onSaveDefault?: (status: JobStatus | '', tags: string[]) => Promise<void>
}

export function JobFilterPanel({
  open, onClose, activeStatus, activeTags, availableTags,
  activeManager, availableManagers,
  defaultStatus = '', defaultTags = [],
  onApply, onClear, onSaveDefault,
}: Props) {
  const [pendingStatus, setPendingStatus] = useState<JobStatus | ''>(activeStatus)
  const [pendingTags, setPendingTags] = useState<string[]>(activeTags)
  const [pendingManager, setPendingManager] = useState<string | null>(activeManager)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      setPendingStatus(activeStatus)
      setPendingTags(activeTags)
      setPendingManager(activeManager)
    }
  }, [open, activeStatus, activeTags, activeManager])

  const activeFilterCount =
    (activeStatus ? 1 : 0) +
    (activeTags.length > 0 ? 1 : 0) +
    (activeManager ? 1 : 0)

  const isCurrentDefault =
    pendingStatus === defaultStatus &&
    pendingTags.length === defaultTags.length &&
    pendingTags.every(t => defaultTags.includes(t))

  function toggleStatus(v: JobStatus) {
    setSaved(false)
    setPendingStatus(prev => (prev === v ? '' : v))
  }

  function toggleTag(t: string) {
    setSaved(false)
    setPendingTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function toggleManager(id: string) {
    setSaved(false)
    setPendingManager(prev => (prev === id ? null : id))
  }

  async function handleSaveDefault() {
    if (!onSaveDefault) return
    await onSaveDefault(pendingStatus, pendingTags)
    setSaved(true)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full z-50 w-80 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 min-h-[52px]">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">
            Filter Your Results
          </span>
          {activeFilterCount > 0 && (
            <>
              <span className="text-gray-300 text-xs">|</span>
              <span className="text-xs font-semibold text-navy-700 whitespace-nowrap">
                {activeFilterCount} Filter{activeFilterCount !== 1 ? 's' : ''} Applied
              </span>
              <button
                onClick={() => { onClear(); onClose() }}
                className="text-xs text-blue-500 hover:text-blue-700 font-semibold ml-auto shrink-0"
              >
                clear
              </button>
            </>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* Job Status */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Job Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(o => {
                const active = pendingStatus === o.value
                return (
                  <button
                    key={o.value}
                    onClick={() => toggleStatus(o.value)}
                    className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-navy-700 text-white border-navy-700'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-navy-400 hover:text-navy-700'
                    }`}
                  >
                    {o.label}
                    {active && <X size={12} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tags */}
          {availableTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(t => {
                  const active = pendingTags.includes(t)
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTag(t)}
                      className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-navy-700 text-white border-navy-700'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-navy-400 hover:text-navy-700'
                      }`}
                    >
                      {t}
                      {active && <X size={12} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Manager */}
          {availableManagers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Manager
              </p>
              <div className="flex flex-wrap gap-2">
                {availableManagers.map(u => {
                  const active = pendingManager === u.id
                  const label = u.full_name ?? u.email.split('@')[0]
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleManager(u.id)}
                      className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-navy-700 text-white border-navy-700'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-navy-400 hover:text-navy-700'
                      }`}
                    >
                      {label}
                      {active && <X size={12} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-4 space-y-2">
          <div className="flex gap-3">
            <button
              onClick={() => { onApply(pendingStatus, pendingTags, pendingManager); onClose() }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              Update Results
            </button>
            <button
              onClick={() => { setSaved(false); setPendingStatus(''); setPendingTags([]); setPendingManager(null) }}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset Filters
            </button>
          </div>
          {onSaveDefault && (
            <button
              onClick={handleSaveDefault}
              disabled={isCurrentDefault || saved}
              className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors ${
                saved || isCurrentDefault
                  ? 'text-gold-600 bg-gold-50 border border-gold-200 cursor-default'
                  : 'text-gray-500 hover:text-navy-700 hover:bg-gray-50 border border-transparent'
              }`}
            >
              <Star size={12} className={saved || isCurrentDefault ? 'fill-gold-500 text-gold-500' : ''} />
              {saved ? 'Saved as your default' : isCurrentDefault ? 'This is your default' : 'Save as my default'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
