'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Briefcase, DollarSign, Calendar, CheckSquare, FileText, LogOut,
  ChevronDown, ShieldCheck, Clock, Folder, Users, Target, TrendingUp,
  HardHat, BarChart3, ClipboardList,
  Home, Grid3X3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useJob } from '@/hooks/useJob'
import { JobPickerSheet, DesktopJobPanel } from '@/components/jobs'
import { HermesChatPanel } from '@/components/hermes/HermesChatPanel'

// ── Desktop top tabs (unchanged) ─────────────────────────────────────────────
const TABS = [
  { key: 'leads',         label: 'Leads',         icon: Target       },
  { key: 'jobs',          label: 'Jobs',          icon: Briefcase    },
  { key: 'budget',        label: 'Budget',        icon: DollarSign   },
  { key: 'schedule',      label: 'Schedule',      icon: Calendar     },
  { key: 'tasks',         label: 'Tasks',         icon: CheckSquare  },
  { key: 'logs',          label: 'Logs',          icon: FileText     },
  { key: 'estimates',     label: 'Estimates',     icon: ClipboardList},
  { key: 'profitability', label: 'Profitability', icon: TrendingUp   },
  { key: 'finance',       label: 'Finance',       icon: BarChart3    },
  { key: 'vendors',       label: 'Vendors',       icon: HardHat      },
  { key: 'contacts',      label: 'Contacts',      icon: Users        },
  { key: 'documents',     label: 'Documents',     icon: Folder       },
  { key: 'time-clock',    label: 'Time Clock',    icon: Clock        },
  { key: 'admin',         label: 'Admin',         icon: ShieldCheck  },
]

const JOB_SCOPED_TABS = new Set(['budget', 'schedule', 'tasks', 'logs', 'estimates', 'profitability'])

// ── Mobile bottom nav (5 tabs) ────────────────────────────────────────────────
const MOBILE_NAV = [
  { key: 'home',       label: 'Home',       icon: Home       },
  { key: 'jobs',       label: 'Jobs',       icon: Briefcase  },
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare},
  { key: 'time-clock', label: 'Time Clock', icon: Clock      },
  { key: 'more',       label: 'More',       icon: Grid3X3    },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const segments = pathname.split('/').filter(Boolean)
  const jobId = segments[0] === 'jobs' && segments[1] ? segments[1] : null

  const { job } = useJob(jobId)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Desktop tab routing ───────────────────────────────────────────────────
  function tabHref(key: string): string {
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

  function isActiveDesktop(key: string): boolean {
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

  // ── Mobile tab routing ────────────────────────────────────────────────────
  function mobileTabHref(key: string): string | null {
    if (key === 'home')       return '/jobs'
    if (key === 'jobs')       return null // opens picker
    if (key === 'tasks')      return jobId ? `/jobs/${jobId}/tasks` : null // null → opens picker
    if (key === 'time-clock') return '/time-clock'
    if (key === 'more')       return '/more'
    return null
  }

  function isActiveMobile(key: string): boolean {
    if (key === 'home')       return pathname === '/jobs' && !segments[1]
    if (key === 'jobs')       return false // picker button, never "active"
    if (key === 'tasks')      return pathname.endsWith('/tasks')
    if (key === 'time-clock') return pathname.startsWith('/time-clock')
    if (key === 'more')       return pathname === '/more'
    return false
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
            const active = isActiveDesktop(key)
            return (
              <Link
                key={key}
                href={href}
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
        <header className="md:hidden bg-[#1b2b4a] px-4 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 min-w-0 flex-1"
          >
            <div className="min-w-0">
              <p className="text-[#d4a83c] text-[10px] font-bold tracking-widest uppercase leading-none mb-0.5">
                {jobId ? (job?.status ?? '…') : 'BuildOS'}
              </p>
              <div className="flex items-center gap-1">
                <span className="font-display text-base font-bold text-white truncate">
                  {jobId ? (job?.name ?? '…') : 'All Jobs'}
                </span>
                <ChevronDown size={14} className="text-[#d4a83c] shrink-0" />
              </div>
            </div>
          </button>
          <button
            onClick={signOut}
            className="text-[#4d6a9a] hover:text-white transition-colors shrink-0 ml-3"
            aria-label="Sign out"
          >
            <LogOut size={20} />
          </button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-6 pb-28 md:pb-8">
          {children}
        </main>

        {/* ── Mobile 5-tab bottom nav ── */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch"
          style={{
            background: '#1b2b4a',
            borderTop: '1px solid #243558',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {MOBILE_NAV.map(({ key, label, icon: Icon }) => {
            const href = mobileTabHref(key)
            const active = isActiveMobile(key)

            // Tabs with no href open the job picker (with optional destination intent)
            if (href === null) {
              return (
                <button
                  key={key}
                  onClick={() => { setPickerFor(key === 'jobs' ? null : key); setPickerOpen(true) }}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors text-[#3a5280] hover:text-white"
                >
                  <Icon size={22} />
                  <span className="text-[10px] font-semibold">{label}</span>
                </button>
              )
            }

            return (
              <Link
                key={key}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors ${
                  active ? 'text-[#d4a83c]' : 'text-[#3a5280] hover:text-white'
                }`}
              >
                <Icon size={22} />
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile job picker sheet */}
      {pickerOpen && (
        <JobPickerSheet
          onClose={() => { setPickerOpen(false); setPickerFor(null) }}
          currentJobId={jobId}
          onSelect={pickerFor ? (job) => {
            setPickerOpen(false)
            setPickerFor(null)
            router.push(`/jobs/${job.id}/${pickerFor}`)
          } : undefined}
        />
      )}

      {/* Fixer float button — desktop only (mobile uses the home screen button) */}
      <div className="hidden md:block">
        <HermesChatPanel />
      </div>
    </div>
  )
}
