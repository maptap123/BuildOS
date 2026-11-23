'use client'

import { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { CommentsPanel } from '@/components/selections/CommentsPanel'

/** Page body on the left; comment panel docked on the right (desktop) or a drawer (phone). */
export function SharedShell({
  token, selections, children,
}: {
  token: string
  selections: { id: string; title: string }[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const url = `/api/public/selections/${token}/comments`

  return (
    <div className="md:flex md:h-screen">
      <div className="flex-1 md:overflow-y-auto">{children}</div>

      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-navy-900 text-white px-4 py-3 text-sm font-semibold shadow-lg"
      >
        <MessageSquare size={16} /> Comments
      </button>

      <aside
        className={`bg-white border-l border-border flex-col
          ${open ? 'fixed inset-0 z-40 flex' : 'hidden'} md:static md:flex md:w-[360px] md:shrink-0`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-display font-bold text-navy-900">Comments</h2>
          <button onClick={() => setOpen(false)} aria-label="Close" className="md:hidden p-1 text-gray-500"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0">
          <CommentsPanel mode="client" listUrl={url} postUrl={url} selections={selections} />
        </div>
      </aside>
    </div>
  )
}
