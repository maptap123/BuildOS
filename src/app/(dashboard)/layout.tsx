'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Briefcase, DollarSign, Calendar, CheckSquare, FileText, LogOut, ChevronDown, ShieldCheck, Clock, Folder, Users, Target, TrendingUp, HardHat, BarChart3, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useJob } from '@/hooks/useJob'
import { JobPickerSheet, DesktopJobPanel } from '@/components/jobs'
import { HermesChatPanel } from '@/components/hermes/HermesChatPanel'

const TABS = [
  { key: 'leads',      label: 'Leads',      icon: Target      },
  { key: 'jobs',       label: 'Jobs',       icon: Briefcase   },
  { key: 'budget',     label: 'Budget',     icon: DollarSign  },
  { key: 'schedule',   label: 'Schedule',   icon: Calendar    },
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare },
  { key: 'logs',            label: 'Logs',          icon: FileText    },
  { key: 'estimates',        label: 'Estimates',     icon: ClipboardList },
  { key: 'profitability',   label: 'Profitability', icon: TrendingUp  },
  { key: 'finance',         label: 'Finance',       icon: BarChart3   },
  { key: 'vendors',         label: 'Vendors',       icon: HardHat     },
  { key: 'contacts',        label: 'Contacts',      icon: Users       },
  { key: 'documents',  label: 'Documents',  icon: Folder      },
  { key: 'time-clock', label: 'Time Clock', icon: Clock       },
  { key: 'admin',      label: 'Admin',      icon: ShieldCheck },
]

const JOB_SCOPED_TABS = new Set(['budget', 'schedule', 'tasks', 'logs', 'estimates', 'profitability'])

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)

  const segments = pathname.split('/').filter(Boolean)
  const jobId = segments[0] === 'jobs' && segments[1] ? segments[1] : null

  const { job } = useJob(jobId)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function tabHref(key: string): string | null {
    if (key === 'leads')      return '/leads'
    if (key === 'jobs')       return '/jobs'
    if (key === 'finance')    return '/finance'
    if (key === 'admin')      return '/admin'
    if (key === 'time-clock') return '/time-clock'
    if (key === 'vendors')    return '/vendors'
    if (key === 'contacts')   return '/contacts'
    if (key === 'documents')  return '/documents'
    if (!jobId && JOB_SCOPED_TABS.has(key)) return `/jobs?selectJob=${key}`
    if (!jobId) return '/jobs'
    return `/jobs/${jobId}/${key}`
  }

  function isActive(key: string): boolean {
    if (key === 'leads')      return pathname.startsWith('/leads')
    if (key === 'jobs')       return pathname === '/jobs' || (!!jobId && segments.length === 2)
    if (key === 'finance')    return pathname.startsWith('/finance')
    if (key === 'admin')      return pathname.startsWith('/admin')
    if (key === 'time-clock') return pathname.startsWith('/time-clock')
    if (key === 'vendors')    return pathname.startsWith('/vendors')
    if (key === 'contacts')   return pathname.startsWith('/contacts')
    if (key === 'documents')  return pathname.startsWith('/documents')
    if (!jobId) return false
    return pathname.startsWith(`/jobs/${jobId}/${key}`)
  }

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Desktop: permanent left job panel ── */}
      <DesktopJobPanel currentJobId={jobId} />

      {/* ── Right side: top bar + content ── */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0">

        {/* Desktop top tab bar */}
        <nav className="hidden md:flex items-center gap-1 bg-white border-b border-border px-4 shrink-0 overflow-x-auto scrollbar-none">
          {TABS.map(({ key, label, icon: Icon }) => {
            const href = tabHref(key)
            const active = isActive(key)

            return (
              <Link
                key={key}
                href={href!}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-gold-500 text-navy-900'
                    : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}

          {/* Current job context pill */}
          {jobId && (
            <div className="ml-auto flex items-center gap-2 py-2">
              <span className="text-xs text-gray-400 truncate max-w-[180px]">
                {job?.name ?? '…'}
              </span>
              <span className="text-[10px] text-gray-400 capitalize bg-gray-100 rounded-full px-2 py-0.5">
                {job?.status ?? ''}
              </span>
            </div>
          )}
        </nav>

        {/* Mobile top bar */}
        <header className="md:hidden bg-navy-900 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 min-w-0 flex-1"
          >
            <div className="min-w-0">
              <p className="text-gold-400 text-[10px] font-medium tracking-widest uppercase leading-none mb-0.5">
                {jobId ? (job?.status ?? '…') : 'JDC Platform'}
              </p>
              <div className="flex items-center gap-1">
                <span className="font-display text-base font-bold text-white truncate">
                  {jobId ? (job?.name ?? '…') : 'All Jobs'}
                </span>
                <ChevronDown size={14} className="text-gold-400 shrink-0" />
              </div>
            </div>
          </button>
          <button
            onClick={signOut}
            className="text-navy-300 hover:text-white transition-colors shrink-0 ml-3"
          >
            <LogOut size={20} />
          </button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-6 pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-navy-900 border-t border-navy-800 flex z-30">
          {TABS.map(({ key, label, icon: Icon }) => {
            const href = tabHref(key)
            const active = isActive(key)

            return (
              <Link
                key={key}
                href={href ?? '/jobs'}
                className={`flex-1 flex flex-col items-center py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? 'text-gold-400'
                    : 'text-navy-400 hover:text-white'
                }`}
              >
                <Icon size={20} className="mb-0.5" />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile job picker sheet */}
      {pickerOpen && (
        <JobPickerSheet
          onClose={() => setPickerOpen(false)}
          currentJobId={jobId}
        />
      )}

      {/* Hermes AI chat button — Phase 10b: will open full chat panel */}
      <HermesChatPanel />
    </div>
  )
}
