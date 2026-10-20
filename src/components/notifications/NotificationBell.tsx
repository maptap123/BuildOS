'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import type { Notification } from '@/types'

const POLL_MS = 45_000

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  // 'light' = dark icon for white desktop nav; 'dark' = light icon for the navy mobile header
  variant?: 'light' | 'dark'
}

export function NotificationBell({ variant = 'light' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const [position, setPosition] = useState({ left: 0, top: 0 })

  function positionPanel() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(320, window.innerWidth * 0.9)
    setPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 120)),
    })
  }

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // silent — the bell just stays stale until the next poll
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', positionPanel)
    // Capture scrolls from the horizontal nav as well as the page.
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
    }
  }, [open])

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
  }

  async function handleItemClick(n: Notification) {
    panelRef.current?.hidePopover()
    if (!n.read_at) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      })
    }
    if (n.link) router.push(n.link)
  }

  const iconColor = variant === 'dark' ? 'text-[#4d6a9a] hover:text-white' : 'text-gray-500 hover:text-navy-900'

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={positionPanel}
        popoverTarget={panelId}
        aria-controls={panelId}
        aria-expanded={open}
        className={`relative p-1 transition-colors ${iconColor}`}
        aria-label="Notifications"
      >
        <Bell size={variant === 'dark' ? 20 : 18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* The browser top layer escapes the scrolling nav's clipping and every
          application stacking context (including sheets and Fixer windows).
          Auto popovers also provide outside-click and Escape dismissal. */}
        <div
          ref={panelRef}
          id={panelId}
          popover="auto"
          onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
          aria-label="Notifications"
          className="fixed w-80 max-w-[90vw] bg-white border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ inset: 'auto', margin: 0, left: position.left, top: position.top }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-navy-900">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-navy-500 hover:text-navy-900">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto" style={{ maxHeight: `min(24rem, calc(100dvh - ${position.top + 64}px))` }}>
            {notifications.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No notifications yet.</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                  !n.read_at ? 'bg-gold-50/40' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold-500 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-900 leading-snug">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.body}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
    </div>
  )
}
