'use client'

import { useEffect, useRef, useState } from 'react'
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
import { usePermissions } from '@/hooks/usePermissions'
import { JobPickerSheet, DesktopJobPanel } from '@/components/jobs'
import { HermesChatPanel } from '@/components/hermes/HermesChatPanel'
import { LogDraftSync } from '@/components/logs/LogDraftSync'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ActiveJobProvider, useActiveJob } from '@/contexts/ActiveJobContext'
import type { Job } from '@/types'

// ── Individual tab definition ────────────────────────────────────────────────
type TabItem = {
  key: string
  label: string
  icon: React.ComponentType<{ size?: number }>
}

// ── Top-level nav item: either a standalone tab or a dropdown group ──────────
type NavGroup = {
  key: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  children: TabItem[]
}
type NavItem = TabItem | NavGroup

function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item && Array.isArray((item as NavGroup).children)
}

// ── Desktop grouped nav ──────────────────────────────────────────────────────
const DESKTOP_NAV: NavItem[] = [
  { key: 'leads',    label: 'Leads',    icon: Target    },
  { key: 'jobs',     label: 'Jobs',     icon: Briefcase },
  {
    key: 'finance-group',
    label: 'Finance',
    icon: BarChart3,
    children: [
      { key: 'budget',        label: 'Budget',        icon: DollarSign    },
      { key: 'estimates',     label: 'Estimates',     icon: ClipboardList },
      { key: 'profitability', label: 'Profitability', icon: TrendingUp    },
      { key: 'finance',       label: 'Finance',       icon: BarChart3     },
    ],
  },
  {
    key: 'operations-group',
    label: 'Operations',
    icon: Calendar,
    children: [
      { key: 'schedule', label: 'Schedule', icon: Calendar    },
      { key: 'tasks',    label: 'Tasks',    icon: CheckSquare },
      { key: 'logs',     label: 'Logs',     icon: FileText    },
    ],
  },
  {
    key: 'people-group',
    label: 'People',
    icon: Users,
    children: [
      { key: 'vendors',  label: 'Vendors',  icon: HardHat },
      { key: 'contacts', label: 'Contacts', icon: Users   },
    ],
  },
  { key: 'documents',  label: 'Documents',  icon: Folder      },
  { key: 'time-clock', label: 'Time Clock', icon: Clock       },
  { key: 'admin',      label: 'Admin',      icon: ShieldCheck },
]

type NavKey = string

const JOB_SCOPED_TABS = new Set(['budget', 'schedule', 'tasks', 'logs', 'estimates', 'profitability'])

// ── Mobile bottom nav (5 tabs) ────────────────────────────────────────────────
const MOBILE_NAV = [
  { key: 'home',       label: 'Home',       icon: Home        },
  { key: 'jobs',       label: 'Jobs',       icon: Briefcase   },
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare },
  { key: 'time-clock', label: 'Time Clock', icon: Clock       },
  { key: 'more',       label: 'More',       icon: Grid3X3     },
]

// ── Outer shell — just wraps with the context provider ───────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveJobProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </ActiveJobProvider>
  )
}

// ── Inner layout — consumes the active job context ────────────────────────────
function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)

  // Active job context (persisted, shared across all mobile components)
  const { activeJob, activeJobId, setActiveJob, clearActiveJob } = useActiveJob()

  // Job ID from the current URL (e.g. /jobs/abc123/schedule → "abc123")
  const segments = pathname.split('/').filter(Boolean)
  const urlJobId = segments[0] === 'jobs' && segments[1] && segments[1] !== 'list'
    ? segments[1]
    : null

  // Effective job ID: URL-based job takes precedence; fall back to persisted context
  const effectiveJobId = urlJobId || activeJobId

  // Fetch job data for whichever job is "effective" (used for mobile header + desktop name)
  const { job } = useJob(effectiveJobId)

  // When the user navigates to a specific job URL, sync it to the active context
  useEffect(() => {
    if (urlJobId && job && job.id === urlJobId) {
      setActiveJob({
        id: job.id,
        name: job.name,
        job_number: job.job_number ?? '',
        status: job.status,
        client_name: null,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlJobId, job?.id])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close dropdown on route change
  useEffect(() => { setOpenGroup(null) }, [pathname])

  const { can, isAdmin } = usePermissions()

  const canManageOffice = isAdmin() || can('jobs', 'create') || can('jobs', 'edit')
  const canViewBudget = isAdmin() || can('budget', 'view')

  function canUseNav(key: NavKey): boolean {
    if (key === 'home' || key === 'more') return true
    if (key === 'time-clock') return isAdmin() || can('time_clock', 'view') || can('jobs', 'view')
    if (key === 'jobs') return isAdmin() || can('jobs', 'view')
    if (key === 'schedule') return isAdmin() || can('schedule', 'view')
    if (key === 'tasks') return isAdmin() || can('tasks', 'view')
    if (key === 'logs') return isAdmin() || can('logs', 'view')
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
    if (!urlJobId && JOB_SCOPED_TABS.has(key)) return `/jobs?selectJob=${key}`
    if (!urlJobId) return '/jobs'
    return `/jobs/${urlJobId}/${key}`
  }

  function isActiveDesktop(key: string): boolean {
    if (key === 'leads')      return pathname.startsWith('/leads')
    if (key === 'jobs')       return pathname === '/jobs' || (!!urlJobId && segments.length === 2)
    if (key === 'finance')    return pathname.startsWith('/finance')
    if (key === 'admin')      return pathname.startsWith('/admin')
    if (key === 'time-clock') return pathname.startsWith('/time-clock')
    if (key === 'vendors')    return pathname.startsWith('/vendors')
    if (key === 'contacts')   return pathname.startsWith('/contacts')
    if (key === 'documents')  return pathname.startsWith('/documents')
    if (!urlJobId) return false
    return pathname.startsWith(`/jobs/${urlJobId}/${key}`)
  }

  function isGroupActive(group: NavGroup): boolean {
    return group.children.some(child => isActiveDesktop(child.key))
  }

  // ── Mobile tab routing ────────────────────────────────────────────────────
  function mobileTabHref(key: string): string | null {
    if (key === 'home')       return '/jobs'
    if (key === 'jobs')       return null  // always opens the context picker
    if (key === 'tasks')      return '/tasks'  // cross-job My Tasks, no job pick needed
    if (key === 'time-clock') return '/time-clock'
    if (key === 'more')       return '/more'
    return null
  }

  function isActiveMobile(key: string): boolean {
    if (key === 'home')       return pathname === '/jobs' && !segments[1]
    if (key === 'jobs')       return false // picker button, never "active"
    if (key === 'tasks')      return pathname === '/tasks' || pathname.endsWith('/tasks')
    if (key === 'time-clock') return pathname.startsWith('/time-clock')
    if (key === 'more')       return pathname === '/more'
    return false
  }

  // ── Picker: job selected ──────────────────────────────────────────────────
  function handlePickerSelect(job: Job) {
    setActiveJob({
      id: job.id,
      name: job.name,
      job_number: (job as { job_number?: string }).job_number ?? '',
      status: job.status,
      client_name: (job as { client_name?: string | null }).client_name ?? null,
    })
    setPickerOpen(false)
    if (pickerFor) {
      router.push(`/jobs/${job.id}/${pickerFor}`)
    }
    setPickerFor(null)
  }

  // ── Picker: "All Jobs" selected ───────────────────────────────────────────
  function handlePickerAllJobs() {
    clearActiveJob()
    setPickerOpen(false)
    setPickerFor(null)
    router.push('/jobs')
  }

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Desktop: permanent left job panel ── */}
      <DesktopJobPanel currentJobId={urlJobId} />

      {/* ── Right side: top bar + content ── */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0">

        {/* Desktop top grouped tab bar */}
        <nav
          ref={navRef}
          className="hidden md:flex items-center gap-0.5 bg-white border-b border-border px-4 shrink-0 overflow-x-auto scrollbar-none"
        >
          {DESKTOP_NAV.map((item) => {
            if (isGroup(item)) {
              const visibleChildren = item.children.filter(c => canUseNav(c.key))
              if (visibleChildren.length === 0) return null
              const groupActive = isGroupActive(item)
              const isOpen = openGroup === item.key
              const GroupIcon = item.icon
              return (
                <div key={item.key} className="relative">
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : item.key)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      groupActive || isOpen
                        ? 'border-gold-500 text-navy-900'
                        : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
                    }`}
                  >
                    <GroupIcon size={15} />
                    {item.label}
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 z-50 mt-0 w-44 bg-white border border-border rounded-b-lg shadow-lg py-1">
                      {visibleChildren.map(child => {
                        const ChildIcon = child.icon
                        const childActive = isActiveDesktop(child.key)
                        return (
                          <Link
                            key={child.key}
                            href={tabHref(child.key)}
                            className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                              childActive
                                ? 'text-navy-900 bg-gold-50 font-semibold'
                                : 'text-gray-600 hover:text-navy-900 hover:bg-gray-50'
                            }`}
                          >
                            <ChildIcon size={14} />
                            {child.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // Standalone tab
            if (!canUseNav(item.key)) return null
            const TabIcon = item.icon
            const active = isActiveDesktop(item.key)
            return (
              <Link
                key={item.key}
                href={tabHref(item.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-gold-500 text-navy-900'
                    : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
                }`}
              >
                <TabIcon size={15} />
                {item.label}
              </Link>
            )
          })}

          <div className="ml-auto flex items-center gap-3 py-2">
            {urlJobId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 truncate max-w-[180px]">
                  {job?.name ?? '…'}
                </span>
                <span className="text-[10px] text-gray-400 capitalize bg-gray-100 rounded-full px-2 py-0.5">
                  {job?.status ?? ''}
                </span>
              </div>
            )}
            <NotificationBell variant="light" />
          </div>
        </nav>

        {/* ── Mobile top bar ── */}
        <header className="md:hidden bg-[#1b2b4a] px-4 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 min-w-0 flex-1"
          >
            <div className="min-w-0">
              <p className="text-[#d4a83c] text-[10px] font-bold tracking-widest uppercase leading-none mb-0.5">
                {effectiveJobId
                  ? (job?.status ?? activeJob?.status ?? '…')
                  : 'BuildOS'}
              </p>
              <div className="flex items-center gap-1">
                <span className="font-display text-base font-bold text-white truncate">
                  {effectiveJobId
                    ? (job?.name ?? activeJob?.name ?? '…')
                    : 'All Jobs'}
                </span>
                <ChevronDown size={14} className="text-[#d4a83c] shrink-0" />
              </div>
            </div>
          </button>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <NotificationBell variant="dark" />
            <button
              onClick={signOut}
              className="text-[#4d6a9a] hover:text-white transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={20} />
            </button>
          </div>
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
          {MOBILE_NAV.filter(({ key }) => canUseNav(key as NavKey)).map(({ key, label, icon: Icon }) => {
            const href = mobileTabHref(key)
            const active = isActiveMobile(key)

            if (href === null) {
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (key !== 'jobs') setPickerFor(key)
                    setPickerOpen(true)
                  }}
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

      {/* ── Mobile job context picker ── */}
      {pickerOpen && (
        <JobPickerSheet
          onClose={() => { setPickerOpen(false); setPickerFor(null) }}
          currentJobId={effectiveJobId}
          onSelect={handlePickerSelect}
          onSelectAllJobs={handlePickerAllJobs}
        />
      )}

      {/* Fixer float button — every screen, both viewports */}
      <HermesChatPanel />

      {/* Offline log drafts: retry pending sends on app open / reconnect */}
      <LogDraftSync />
    </div>
  )
}
