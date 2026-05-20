'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Star, ChevronDown, ChevronUp } from 'lucide-react'
import { useJobs } from '@/hooks/useJobs'
import { useTagOptions } from '@/hooks/useTagOptions'
import { useUsers } from '@/hooks/useUsers'
import { useJobFilterPrefs } from '@/hooks/useJobFilterPrefs'
import { JobStatusBadge } from './JobStatusBadge'
import type { JobStatus } from '@/types'

const STATUS_CHIPS: { value: JobStatus; label: string }[] = [
  { value: 'active',   label: 'Active'   },
  { value: 'presale',  label: 'Presale'  },
  { value: 'lead',     label: 'Lead'     },
  { value: 'closed',   label: 'Closed'   },
]

interface Props {
  onClose: () => void
  currentJobId?: string | null
}

export function JobPickerSheet({ onClose, currentJobId }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<JobStatus[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [activeManager, setActiveManager] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const { defaultStatuses, defaultTags, saveDefault, loading: prefLoading } = useJobFilterPrefs()
  const { tags: tagOptions } = useTagOptions()
  const { users } = useUsers()

  const { jobs, loading } = useJobs({
    statuses: statuses.length > 0 ? statuses : undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    manager_id: activeManager,
  })

  useEffect(() => {
    if (!prefLoading) {
      setStatuses(defaultStatuses)
      setSelectedTags(defaultTags)
      if (defaultTags.length > 0) setFiltersOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefLoading])

  const filtered = search.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(search.toLowerCase()) ||
        j.job_number.toLowerCase().includes(search.toLowerCase()) ||
        (j.client_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : jobs

  const activeFilterCount =
    (selectedTags.length > 0 ? 1 : 0) + (activeManager ? 1 : 0)

  const isCurrentDefault =
    statuses.length === defaultStatuses.length &&
    statuses.every(s => defaultStatuses.includes(s)) &&
    selectedTags.length === defaultTags.length &&
    selectedTags.every(t => defaultTags.includes(t))

  function toggleStatus(v: JobStatus) {
    setSaved(false)
    setStatuses(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])
  }

  function clearStatuses() {
    setSaved(false)
    setStatuses([])
  }

  function toggleTag(t: string) {
    setSaved(false)
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function toggleManager(id: string) {
    setSaved(false)
    setActiveManager(prev => prev === id ? null : id)
  }

  function clearExtra() {
    setSaved(false)
    setSelectedTags([])
    setActiveManager(null)
  }

  async function handleSaveDefault() {
    await saveDefault(statuses, selectedTags)
    setSaved(true)
  }

  function select(href: string) {
    router.push(href)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh]">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <h3 className="font-display font-bold text-navy-900 text-lg">Switch Job</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs…"
              autoFocus
              className="w-full pl-8 pr-4 py-2 border border-border rounded-lg text-sm text-navy-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
          </div>
        </div>

        {/* Status chips */}
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto shrink-0">
          <button
            onClick={clearStatuses}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statuses.length === 0
                ? 'bg-navy-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {STATUS_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => toggleStatus(chip.value)}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statuses.includes(chip.value)
                  ? 'bg-navy-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {chip.label}
              {statuses.includes(chip.value) && <X size={9} />}
            </button>
          ))}
        </div>

        {/* Tags + Manager toggle */}
        {(tagOptions.length > 0 || users.length > 0) && (
          <div className="px-4 pb-2 shrink-0">
            <button
              onClick={() => setFiltersOpen(p => !p)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-navy-700 transition-colors"
            >
              {filtersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 bg-navy-900 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="px-4 pb-3 shrink-0 space-y-3 border-b border-gray-100">

            {/* Tags */}
            {tagOptions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {tagOptions.map(t => (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(t.name)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedTags.includes(t.name)
                          ? 'bg-navy-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.name}
                      {selectedTags.includes(t.name) && <X size={10} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manager */}
            {users.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Manager</p>
                <div className="flex flex-wrap gap-1.5">
                  {users.map(u => {
                    const label = u.full_name ?? u.email.split('@')[0]
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleManager(u.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          activeManager === u.id
                            ? 'bg-navy-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                        {activeManager === u.id && <X size={10} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Save default / Clear */}
            <div className="flex items-center justify-between pt-0.5">
              <button
                onClick={handleSaveDefault}
                disabled={isCurrentDefault || saved}
                className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                  saved || isCurrentDefault
                    ? 'text-gold-600 cursor-default'
                    : 'text-gray-400 hover:text-navy-700'
                }`}
              >
                <Star size={11} className={saved || isCurrentDefault ? 'fill-gold-500 text-gold-500' : ''} />
                {saved ? 'Saved' : isCurrentDefault ? 'Default' : 'Save default'}
              </button>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearExtra}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Job list */}
        <div className="overflow-y-auto flex-1 pb-8">

          {/* All Jobs */}
          <button
            onClick={() => select('/jobs')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
              !currentJobId ? 'bg-gold-50' : ''
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
              <span className="text-navy-700 text-xs font-bold">All</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-900">All Jobs</p>
              <p className="text-xs text-gray-400">Dashboard view</p>
            </div>
            {!currentJobId && <div className="w-2 h-2 rounded-full bg-gold-500 shrink-0" />}
          </button>

          {loading ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No jobs found</div>
          ) : (
            filtered.map(job => (
              <button
                key={job.id}
                onClick={() => select(`/jobs/${job.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                  job.id === currentJobId ? 'bg-gold-50' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                  <span className="text-navy-700 text-[11px] font-bold">
                    {job.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-900 truncate">{job.name}</p>
                  <p className="text-xs text-gray-400">{job.client_name ?? ''}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <JobStatusBadge status={job.status} />
                  {job.id === currentJobId && <div className="w-2 h-2 rounded-full bg-gold-500" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
