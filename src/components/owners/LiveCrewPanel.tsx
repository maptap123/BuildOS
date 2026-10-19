'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import type { LiveShift } from '@/lib/owners/data'
import { C, money } from './theme'

const POLL_MS = 30_000

function elapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
}

/** Polls /api/owners/live and ticks the timers every second. `jobId` narrows it to one job. */
export function useLiveCrew(initial: LiveShift[], jobId?: string) {
  const [shifts, setShifts] = useState(initial)
  const [now, setNow] = useState<number | null>(null)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    setSyncedAt(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)
    let alive = true
    async function poll() {
      try {
        const res = await fetch('/api/owners/live', { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json() as { shifts: LiveShift[] }
        if (!alive) return
        setShifts(jobId ? body.shifts.filter(s => s.jobId === jobId) : body.shifts)
        setSyncedAt(Date.now())
      } catch { /* keep the last good list */ }
    }
    const t = setInterval(poll, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(tick); clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [jobId])

  return { shifts, now, syncedAt }
}

export function LiveCrewPanel({
  shifts, now, syncedAt, linkJobs = true, title = 'On the clock',
}: {
  shifts: LiveShift[]
  now: number | null
  syncedAt: number | null
  linkJobs?: boolean
  title?: string
}) {
  const burn = shifts.reduce((s, x) => s + x.hourlyRate, 0)
  const costSoFar = now ? shifts.reduce((s, x) => s + ((now - Date.parse(x.clockIn)) / 3_600_000) * x.hourlyRate, 0) : 0

  return (
    <section className="flex h-full flex-col rounded-xl border p-4" style={{ background: C.panel, borderColor: C.border }}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: C.text }}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: C.good }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: C.good }} />
          </span>
          {title}
          <span className="rounded-full px-2 py-0.5 font-mono text-xs" style={{ background: C.panel2, color: C.text }}>{shifts.length}</span>
        </h2>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
          {syncedAt ? `Live · ${new Date(syncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Live'}
        </span>
      </header>

      {shifts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-sm" style={{ color: C.muted }}>
          <Users size={22} />
          Nobody is clocked in right now.
        </div>
      ) : (
        <>
          <ul className="flex-1 space-y-1.5 overflow-y-auto" style={{ maxHeight: 320 }}>
            {shifts.map(s => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2" style={{ background: C.panel2 }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: '#1d3a63', color: C.text }}>{initials(s.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: C.text }}>{s.name}</div>
                  <div className="truncate text-xs" style={{ color: C.text2 }}>
                    {linkJobs && s.jobId
                      ? <Link href={`/owners/${s.jobId}`} className="hover:underline">{s.jobName}</Link>
                      : s.jobName}
                    {' · in '}
                    {new Date(s.clockIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums" style={{ color: C.text }}>{now ? elapsed(s.clockIn, now) : '—'}</div>
                  {s.hourlyRate > 0 && now && (
                    <div className="font-mono text-[10px] tabular-nums" style={{ color: C.muted }}>
                      {money(((now - Date.parse(s.clockIn)) / 3_600_000) * s.hourlyRate)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {burn > 0 && (
            <footer className="mt-3 flex justify-between border-t pt-2 text-xs" style={{ borderColor: C.border, color: C.text2 }}>
              <span>Burn rate <span className="font-mono" style={{ color: C.text }}>{money(burn)}/hr</span></span>
              <span>Open shifts <span className="font-mono" style={{ color: C.text }}>{money(costSoFar)}</span></span>
            </footer>
          )}
        </>
      )}
    </section>
  )
}
