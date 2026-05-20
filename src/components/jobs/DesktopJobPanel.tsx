'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, LogOut, Star, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useJobs } from '@/hooks/useJobs'
import { usePermissions } from '@/hooks/usePermissions'
import { useTagOptions } from '@/hooks/useTagOptions'
import { useUsers } from '@/hooks/useUsers'
import { useJobFilterPrefs } from '@/hooks/useJobFilterPrefs'
import { JobStatusBadge } from './JobStatusBadge'
import { AddJobModal } from './AddJobModal'
import type { Job, JobStatus } from '@/types'

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'lead',     label: 'Lead'     },
  { value: 'presale',  label: 'Presale'  },
  { value: 'active',   label: 'Active'   },
  { value: 'closed',   label: 'Closed'   },
  { value: 'archived', label: 'Archived' },
]

interface Props {
  currentJobId: string | null
}

export function DesktopJobPanel({ currentJobId }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<JobStatus[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [activeManager, setActiveManager] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showAddJob, setShowAddJob] = useState(false)

  const { defaultStatuses, defaultTags, saveDefault, loading: prefLoading } = useJobFilterPrefs()
  const { tags: tagOptions } = useTagOptions()
  const { users } = useUsers()
  const { can, isAdmin } = usePermissions()
  const canCreate = can('jobs', 'create') || isAdmin()

  const { jobs, loading } = useJobs({
    statuses: statuses.length > 0 ? statuses : undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    manager_id: activeManager,
  })

  useEffect(() => {
    if (!prefLoading) {
      setStatuses(defaultStatuses)
      setSelectedTags(defaultTags)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefLoading])

  const filtered = search.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(search.toLowerCase()) ||
        (j.client_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        j.job_number.toLowerCase().includes(search.toLowerCase())
      )
    : jobs

  const activeFilterCount =
    (statuses.length > 0 ? 1 : 0) + (selectedTags.length > 0 ? 1 : 0) + (activeManager ? 1 : 0)

  const isCurrentDefault =
    statuses.length === defaultStatuses.length &&
    statuses.every(s => defaultStatuses.includes(s)) &&
    selectedTags.length === defaultTags.length &&
    selectedTags.every(t => defaultTags.includes(t))

  function toggleStatus(v: JobStatus) {
    setSaved(false)
    setStatuses(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])
  }

  function toggleTag(t: string) {
    setSaved(false)
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function toggleManager(id: string) {
    setSaved(false)
    setActiveManager(prev => (prev === id ? null : id))
  }

  function clearFilters() {
    setSaved(false)
    setStatuses([])
    setSelectedTags([])
    setActiveManager(null)
  }

  async function handleSaveDefault() {
    await saveDefault(statuses, selectedTags)
    setSaved(true)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleJobCreated(job: Job) {
    setShowAddJob(false)
    router.push(`/jobs/${job.id}`)
  }

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-border fixed inset-y-0 left-0 z-30">

        {/* Brand */}
        <div className="px-4 py-4 border-b border-border shrink-0">
          <h1 className="font-display text-lg font-bold text-navy-900">JDC</h1>
          <p className="text-gold-500 text-[10px] font-semibold tracking-widest uppercase leading-none mt-0.5">
            Platform
          </p>
        </div>

        {/* ── Filters ── */}
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border space-y-3">

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs…"
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-sm text-navy-900 placeholder-gray-400 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
            />
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Status</p>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => toggleStatus(o.value)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    statuses.includes(o.value)
                      ? 'bg-navy-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                  {statuses.includes(o.value) && <X size={10} />}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {tagOptions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1">
                {tagOptions.map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
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
              <div className="flex flex-wrap gap-1">
                {users.map(u => {
                  const label = u.full_name ?? u.email.split('@')[0]
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleManager(u.id)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
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
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : 'filter'}
              </button>
            )}
          </div>
        </div>

        {/* ── Job list ── */}
        <div className="flex-1 overflow-y-auto">
          {/* All Jobs / Dashboard */}
          <button
            onClick={() => router.push('/jobs')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
              !currentJobId ? 'bg-gold-50' : ''
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-navy-100 flex items-center justify-center shrink-0 text-navy-700 text-[10px] font-bold">
              All
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-900">All Jobs</p>
              <p className="text-[11px] text-gray-400">Dashboard</p>
            </div>
            {!currentJobId && <div className="w-1.5 h-1.5 rounded-full bg-gold-500 shrink-0" />}
          </button>

          {loading ? (
            <div className="px-3 py-4 space-y-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-gray-400 text-xs">No jobs found</p>
          ) : (
            filtered.map(job => (
              <button
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                  job.id === currentJobId ? 'bg-gold-50' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-navy-100 flex items-center justify-center shrink-0 text-navy-700 text-[10px] font-bold">
                  {job.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{job.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{job.client_name ?? ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <JobStatusBadge status={job.status} />
                  {job.id === currentJobId && <div className="w-1.5 h-1.5 rounded-full bg-gold-500" />}
                </div>
              </button>
            ))
          )}
        </div>

        {/* ── Bottom actions ── */}
        <div className="px-3 py-3 border-t border-border space-y-1 shrink-0">
          {canCreate && (
            <button
              onClick={() => setShowAddJob(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold transition-colors"
            >
              <Plus size={15} />
              New Job
            </button>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-sm transition-colors"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {showAddJob && (
        <AddJobModal
          onClose={() => setShowAddJob(false)}
          onCreated={handleJobCreated}
        />
      )}
    </>
  )
}
