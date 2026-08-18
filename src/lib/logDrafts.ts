'use client'

/**
 * Offline-tolerant daily log drafts.
 *
 * Draft persistence, not full offline sync: log text is autosaved to
 * localStorage on every keystroke from all log entry paths. If a submit
 * fails (dead zone, dropped LTE), the draft is marked `pending` and retried
 * when the connection returns or the app is reopened.
 *
 * Photos are NOT persisted here (localStorage can't hold multi-MB files) —
 * they stay attached in component state until the log is sent from that screen.
 */

import type { DailyLog } from '@/types'

const STORAGE_KEY = 'buildos_log_drafts'

/** Fired on window whenever a pending draft syncs, so feeds can refresh. */
export const LOG_DRAFT_SYNCED_EVENT = 'buildos:log-draft-synced'

export interface LogDraft {
  /** Stable key per entry surface, e.g. `add:<jobId>`, `traditional`, `ai:<jobId>` */
  key: string
  job_id: string | null
  job_name?: string | null
  log_date: string
  work_performed: string
  cost_code?: string | null
  /** True once a submit was attempted and failed — eligible for auto-retry */
  pending: boolean
  updated_at: string
}

type DraftMap = Record<string, LogDraft>

function readAll(): DraftMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as DraftMap : {}
  } catch {
    return {}
  }
}

function writeAll(map: DraftMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage full / private mode — drafts become session-only
  }
}

export function saveLogDraft(draft: Omit<LogDraft, 'updated_at' | 'pending'> & { pending?: boolean }) {
  const map = readAll()
  // Empty text and not pending → nothing worth keeping
  if (!draft.work_performed.trim() && !draft.pending) {
    if (map[draft.key]) { delete map[draft.key]; writeAll(map) }
    return
  }
  map[draft.key] = {
    ...draft,
    pending: draft.pending ?? map[draft.key]?.pending ?? false,
    updated_at: new Date().toISOString(),
  }
  writeAll(map)
}

export function loadLogDraft(key: string): LogDraft | null {
  return readAll()[key] ?? null
}

export function clearLogDraft(key: string) {
  const map = readAll()
  if (map[key]) {
    delete map[key]
    writeAll(map)
  }
}

export function markLogDraftPending(key: string) {
  const map = readAll()
  if (map[key]) {
    map[key] = { ...map[key], pending: true, updated_at: new Date().toISOString() }
    writeAll(map)
  }
}

export function listPendingLogDrafts(): LogDraft[] {
  return Object.values(readAll()).filter(d => d.pending && d.job_id && d.work_performed.trim())
}

/**
 * Try to submit every pending draft. Returns the number successfully synced.
 * Fires LOG_DRAFT_SYNCED_EVENT when at least one goes through.
 */
export async function retryPendingLogDrafts(): Promise<number> {
  const pending = listPendingLogDrafts()
  if (pending.length === 0) return 0

  let synced = 0
  for (const draft of pending) {
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: draft.job_id,
          log_date: draft.log_date,
          work_performed: draft.work_performed.trim(),
          cost_code: draft.cost_code?.trim() || null,
        }),
      })
      if (res.ok) {
        await res.json().catch(() => null) as DailyLog | null
        clearLogDraft(draft.key)
        synced++
      }
      // Non-OK (validation/permission) → leave draft; user resolves manually
    } catch {
      // Still offline — try again on the next 'online' event or app open
      break
    }
  }

  if (synced > 0) {
    window.dispatchEvent(new CustomEvent(LOG_DRAFT_SYNCED_EVENT, { detail: { synced } }))
  }
  return synced
}
