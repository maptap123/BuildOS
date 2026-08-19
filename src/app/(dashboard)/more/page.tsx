'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Target, DollarSign, Calendar, CheckSquare,
  FileText, Folder, Users, HardHat, BarChart3, TrendingUp,
  Clock, ShieldCheck, LogOut, ChevronRight, ClipboardList,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/usePermissions'
import { useActiveJob } from '@/contexts/ActiveJobContext'
import { JobPickerSheet } from '@/components/jobs'
import type { Job } from '@/types'

const SECTIONS = [
  {
    title: 'Management',
    items: [
      { key: 'leads',         label: 'Leads',          icon: Target,       href: '/leads',        description: 'CRM pipeline' },
      { key: 'finance',       label: 'Finance',        icon: BarChart3,    href: '/finance',      description: 'Overview & reports' },
      { key: 'vendors',       label: 'Vendors',        icon: HardHat,      href: '/vendors',      description: 'Vendor directory' },
      { key: 'contacts',      label: 'Contacts',       icon: Users,        href: '/contacts',     description: 'Homeowner & sub directory' },
    ],
  },
  {
    title: 'Job Tools',
    items: [
      { key: 'budget',        label: 'Budget',         icon: DollarSign,   href: '/jobs?selectJob=budget',        description: 'Budget & cost control' },
      { key: 'profitability', label: 'Profitability',  icon: TrendingUp,   href: '/jobs?selectJob=profitability', description: 'Job profitability' },
      { key: 'estimates',     label: 'Estimates',      icon: ClipboardList,href: '/jobs?selectJob=estimates',     description: 'Estimate builder' },
      { key: 'logs',          label: 'Daily Logs',     icon: FileText,     href: '/jobs?selectJob=logs',          description: 'Field logs & photos' },
      { key: 'schedule',      label: 'Schedule',       icon: Calendar,     href: '/jobs?selectJob=schedule',      description: 'Job timeline' },
      { key: 'tasks',         label: 'Tasks',          icon: CheckSquare,  href: '/tasks',                        description: 'My tasks across all jobs' },
      { key: 'documents',     label: 'Documents',      icon: Folder,       href: '/documents',                    description: 'File center' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { key: 'admin',         label: 'Admin',          icon: ShieldCheck,  href: '/admin',        description: 'Users & permissions' },
      { key: 'time-clock',    label: 'Time Clock',     icon: Clock,        href: '/time-clock',   description: 'Clock in / out' },
    ],
  },
]

// These tools live under /jobs/[id]/… and need a job before they can open.
// Tapping one uses the persisted active job, or opens the job picker with
// destination intent — same flow as the bottom-nav Jobs tab.
const JOB_SCOPED_TOOLS = new Set(['budget', 'profitability', 'estimates', 'logs', 'schedule'])

export default function MorePage() {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const { activeJobId, setActiveJob } = useActiveJob()
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const canManageOffice = isAdmin() || can('jobs', 'create') || can('jobs', 'edit')
  const canViewBudget = isAdmin() || can('budget', 'view')

  // Launch role gate: money/office screens are desktop territory. On mobile,
  // only office-level users (admin, or budget/finance view) ever see them —
  // crew get Today / Jobs / Log / Tasks / Clock and the field tools below.
  const isOfficeUser = isAdmin() || can('budget', 'view') || can('finance', 'view')
  const OFFICE_ONLY = new Set(['budget', 'estimates', 'finance', 'profitability', 'vendors', 'leads'])

  function canUseItem(key: string): boolean {
    if (OFFICE_ONLY.has(key) && !isOfficeUser) return false
    if (key === 'time-clock') return isAdmin() || can('time_clock', 'view') || can('jobs', 'view')
    if (key === 'logs') return isAdmin() || can('logs', 'view')
    if (key === 'schedule') return isAdmin() || can('schedule', 'view')
    if (key === 'tasks') return isAdmin() || can('tasks', 'view')
    if (key === 'documents') return isAdmin() || can('documents', 'view')
    if (key === 'budget') return canViewBudget
    if (key === 'finance') return isAdmin() || can('finance', 'view') || canViewBudget
    if (key === 'profitability') return isAdmin() || can('profitability', 'view') || canViewBudget
    if (key === 'estimates') return isAdmin() || can('estimates', 'view') || canViewBudget
    if (key === 'leads') return isAdmin() || can('leads', 'view') || canManageOffice
    if (key === 'vendors') return isAdmin() || can('vendors', 'view') || canManageOffice
    if (key === 'contacts') return isAdmin() || can('contacts', 'view') || canManageOffice
    if (key === 'admin') return isAdmin()
    return false
  }

  const visibleSections = SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => canUseItem(item.key)) }))
    .filter(section => section.items.length > 0)

  function openJobTool(tab: string) {
    if (activeJobId) {
      router.push(`/jobs/${activeJobId}/${tab}`)
    } else {
      setPickerFor(tab)
    }
  }

  function handlePickerSelect(job: Job) {
    setActiveJob({
      id: job.id,
      name: job.name,
      job_number: job.job_number ?? '',
      status: job.status,
      client_name: job.client_name ?? null,
    })
    const tab = pickerFor
    setPickerFor(null)
    if (tab) router.push(`/jobs/${job.id}/${tab}`)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-lg mx-auto pb-32">
      <h1 className="font-display text-2xl font-bold text-[#1b2b4a] mb-6 px-1">More</h1>

      <div className="space-y-6">
        {visibleSections.map(section => (
          <div key={section.title}>
            <p className="text-[10px] font-bold tracking-[0.15em] text-[#4d6a9a] uppercase px-1 mb-2">
              {section.title}
            </p>
            <div
              className="rounded-2xl overflow-hidden bg-white"
              style={{ border: '1px solid #e2ddd6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              {section.items.map((item, idx) => {
                const rowClass = `flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-[#f0ede8] hover:bg-[#f8f7f4] ${idx < section.items.length - 1 ? 'border-b border-[#e2ddd6]' : ''}`
                const rowContent = (
                  <>
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
                    >
                      <item.icon size={17} className="text-[#d4a83c]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1b2b4a] text-sm">{item.label}</p>
                      <p className="text-xs text-[#4d6a9a]">{item.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-[#4d6a9a] shrink-0" />
                  </>
                )

                if (JOB_SCOPED_TOOLS.has(item.key)) {
                  return (
                    <button
                      key={item.key}
                      onClick={() => openJobTool(item.key)}
                      className={`w-full text-left ${rowClass}`}
                    >
                      {rowContent}
                    </button>
                  )
                }

                return (
                  <Link key={item.key} href={item.href} className={rowClass}>
                    {rowContent}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Sign out */}
        <div>
          <div
            className="rounded-2xl overflow-hidden bg-white"
            style={{ border: '1px solid #e2ddd6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            <button
              onClick={signOut}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors active:bg-red-50 hover:bg-red-50"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                <LogOut size={17} className="text-red-500" />
              </div>
              <p className="font-semibold text-red-600 text-sm">Sign Out</p>
            </button>
          </div>
        </div>
      </div>

      {/* Job picker — opens when a job-scoped tool is tapped with no active job */}
      {pickerFor && (
        <JobPickerSheet
          onClose={() => setPickerFor(null)}
          currentJobId={activeJobId}
          onSelect={handlePickerSelect}
        />
      )}
    </div>
  )
}
