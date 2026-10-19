'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * A bottom sheet on a phone, a centred dialog on a desktop — one component, CSS
 * breakpoints only (the mobile architecture rule: no layout hooks).
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed z-50 bg-white flex flex-col inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl md:max-h-[85vh] md:rounded-2xl"
        style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}
      >
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 md:pt-5 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-navy-900 text-lg leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 -mr-1 text-gray-400 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </>
  )
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

export const inputClass =
  'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-navy-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-400'

export const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'

/** The rooms JDC uses in BuilderTrend, as suggestions — any other location can be typed. */
export const ROOM_SUGGESTIONS = [
  'Kitchen', 'Primary Bathroom', 'Hall Bath', 'Powder Room', 'Guest Bathroom', 'Basement Bath',
  'Primary Bedroom', 'Bedroom 2', 'Bedroom 3', 'Great Room', 'Living Room', 'Family Room',
  'Dining Room', 'Laundry Room', 'Mudroom', 'Office', 'Entry', 'Pantry', 'Basement', 'Garage',
  'Exterior', 'Porch', 'Deck', 'Whole House',
]
