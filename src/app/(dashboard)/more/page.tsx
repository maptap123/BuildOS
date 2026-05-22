'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Target, Briefcase, DollarSign, Calendar, CheckSquare,
  FileText, Folder, Users, HardHat, BarChart3, TrendingUp,
  Clock, ShieldCheck, LogOut, ChevronRight, ClipboardList,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const SECTIONS = [
  {
    title: 'Management',
    items: [
      { key: 'leads',         label: 'Leads',          icon: Target,       href: '/leads',        description: 'CRM pipeline' },
      { key: 'finance',       label: 'Finance',        icon: BarChart3,    href: '/finance',      description: 'Overview & reports' },
      { key: 'vendors',       label: 'Vendors',        icon: HardHat,      href: '/vendors',      description: 'Vendor directory' },
      { key: 'contacts',      label: 'Contacts',       icon: Users,        href: '/contacts',     description: 'Client & sub directory' },
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
      { key: 'tasks',         label: 'Tasks',          icon: CheckSquare,  href: '/jobs?selectJob=tasks',         description: 'All tasks' },
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

export default function MorePage() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-lg mx-auto pb-32">
      <h1 className="font-display text-2xl font-bold text-[#1b2b4a] mb-6 px-1">More</h1>

      <div className="space-y-6">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <p className="text-[10px] font-bold tracking-[0.15em] text-[#4d6a9a] uppercase px-1 mb-2">
              {section.title}
            </p>
            <div
              className="rounded-2xl overflow-hidden bg-white"
              style={{ border: '1px solid #e2ddd6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              {section.items.map((item, idx) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-[#f0ede8] hover:bg-[#f8f7f4] ${idx < section.items.length - 1 ? 'border-b border-[#e2ddd6]' : ''}`}
                >
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
                </Link>
              ))}
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
    </div>
  )
}
