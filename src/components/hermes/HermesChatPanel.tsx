'use client'

/**
 * HermesChatPanel — STUB
 *
 * Phase 10b: Hermes in-app chat interface.
 * Currently renders a closed floating button with a "Coming soon" tooltip.
 *
 * Phase 10b implementation plan:
 *   1. Replace tooltip with a slide-in chat panel (fixed bottom-right)
 *   2. Show conversation history from hermes_conversations on open
 *   3. Wire POST /api/hermes/chat with streaming response display
 *   4. Add context-awareness: read current jobId from URL params and
 *      send it with each message so Hermes auto-knows the active job
 *   5. Add quick-action chips: "My tasks today", "What's overdue?"
 *
 * TODO (Phase 10b): implement full chat panel
 */

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'

export function HermesChatPanel() {
  const [tooltipVisible, setTooltipVisible] = useState(false)

  return (
    <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50">
      {/* Coming soon tooltip */}
      {tooltipVisible && (
        <div
          className="
            absolute bottom-14 right-0
            bg-navy-900 text-white text-xs font-medium
            px-3 py-2 rounded-lg shadow-lg whitespace-nowrap
            before:content-[''] before:absolute before:top-full before:right-4
            before:border-4 before:border-transparent before:border-t-navy-900
          "
          role="tooltip"
        >
          Hermes AI — coming soon
        </div>
      )}

      {/* Floating action button */}
      <button
        aria-label="Open Hermes AI chat (coming soon)"
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        onClick={() => setTooltipVisible((v) => !v)}
        className="
          w-12 h-12 rounded-full
          bg-gold-500 hover:bg-gold-600
          text-navy-900
          shadow-lg hover:shadow-xl
          flex items-center justify-center
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-2
          opacity-80 cursor-not-allowed
        "
      >
        {tooltipVisible
          ? <X size={20} aria-hidden="true" />
          : <MessageCircle size={20} aria-hidden="true" />
        }
      </button>
    </div>
  )
}
