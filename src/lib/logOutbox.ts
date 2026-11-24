'use client'

/**
 * Background outbox for daily logs with photos.
 *
 * Tapping "Save" only writes the log + original photos to IndexedDB (instant),
 * then the sheet closes. A single-flight processor then:
 *   1. POSTs the log (once — the returned id is stored so retries never duplicate it)
 *   2. shrinks each photo (phone photos are 5–12 MB; Vercel rejects bodies > ~4.5 MB)
 *   3. uploads photos one at a time, checking every response
 * Anything that fails for network/server reasons stays in the outbox and is retried
 * on app open, when the connection returns, and on a timer — so photos are never
 * silently dropped.
 */

import { LOG_DRAFT_SYNCED_EVENT } from '@/lib/logDrafts'

export const LOG_OUTBOX_STATUS_EVENT = 'buildos:log-outbox-status'

export interface OutboxStatus {
  kind: 'saving' | 'synced' | 'failed'
  message: string
}

interface OutboxPhoto {
  id: string
  name: string
  blob: Blob
}

interface OutboxItem {
  id: string
  job_id: string
  job_name?: string | null
  log_date: string
  work_performed: string | null
  cost_code: string | null
  logId?: string
  photos: OutboxPhoto[]
  /** Photos that were rejected permanently (e.g. unreadable file) */
  droppedPhotos: number
  /** Permanent failure on the log itself (validation/permission) — needs a human */
  failedReason?: string
  /** Last transient error (network/server) — item is still retrying */
  lastError?: string
  created_at: string
}

export interface OutboxSummary {
  pending: number
  photos: number
  failed: number
  message: string | null
}

const DB_NAME = 'buildos_outbox'
const STORE = 'logs'
const MAX_EDGE = 1920
const JPEG_QUALITY = 0.8
const RETRY_MS = 20_000

// ── storage (IndexedDB, with an in-memory fallback if it's unavailable) ──────

const memory = new Map<string, OutboxItem>()

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } catch (e) {
      reject(e)
    }
  })
}

async function putItem(item: OutboxItem) {
  memory.set(item.id, item)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(item)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // memory copy still works for this session
  }
}

async function deleteItem(id: string) {
  memory.delete(id)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // ignore
  }
}

async function getAllItems(): Promise<OutboxItem[]> {
  const byId = new Map<string, OutboxItem>()
  try {
    const db = await openDb()
    const rows = await new Promise<OutboxItem[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as OutboxItem[])
      req.onerror = () => reject(req.error)
    })
    db.close()
    for (const r of rows) byId.set(r.id, r)
  } catch {
    // fall through to memory
  }
  for (const [id, item] of memory) if (!byId.has(id)) byId.set(id, item)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

// ── helpers ──────────────────────────────────────────────────────────────────

function emit(status: OutboxStatus) {
  window.dispatchEvent(new CustomEvent(LOG_OUTBOX_STATUS_EVENT, { detail: status }))
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Downscale + re-encode to JPEG. Falls back to the original if the browser can't decode it. */
async function shrinkPhoto(blob: Blob, maxEdge = MAX_EDGE, quality = JPEG_QUALITY): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    // Keep whichever is smaller
    return out && out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}

class PermanentError extends Error {}

async function postLog(item: OutboxItem): Promise<string> {
  const res = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id: item.job_id,
      log_date: item.log_date,
      work_performed: item.work_performed,
      cost_code: item.cost_code,
    }),
  })
  if (res.ok) {
    const log = await res.json()
    return log.id as string
  }
  const body = await res.json().catch(() => ({}))
  const msg = body.error ?? `Error ${res.status}`
  // 4xx (except auth blips / timeouts / rate limits) won't fix themselves
  if (res.status >= 400 && res.status < 500 && ![401, 408, 429].includes(res.status)) {
    throw new PermanentError(msg)
  }
  throw new Error(msg)
}

async function postPhoto(item: OutboxItem, photo: OutboxPhoto, smaller = false) {
  const small = smaller ? await shrinkPhoto(photo.blob, 1280, 0.6) : await shrinkPhoto(photo.blob)
  const isJpeg = small.type === 'image/jpeg'
  const base = photo.name.replace(/\.[^.]+$/, '') || 'photo'
  const file = new File([small], `${base}${isJpeg ? '.jpg' : photo.name.match(/\.[^.]+$/)?.[0] ?? ''}`, {
    type: small.type || 'image/jpeg',
  })
  const fd = new FormData()
  fd.append('job_id', item.job_id)
  fd.append('log_id', item.logId!)
  fd.append('file', file)
  const res = await fetch('/api/photos', { method: 'POST', body: fd })
  if (res.ok) return
  // Too big for the server: retry once, much smaller, before giving up
  if (res.status === 413 && !smaller) return postPhoto(item, photo, true)
  const body = await res.json().catch(() => ({}))
  const msg = body.error ?? `Error ${res.status}`
  if (res.status === 413 || (res.status >= 400 && res.status < 500 && ![401, 408, 429].includes(res.status))) {
    throw new PermanentError(msg)
  }
  throw new Error(msg)
}

// ── public API ───────────────────────────────────────────────────────────────

export interface PendingLog {
  id: string
  job_id: string
  job_name: string | null
  log_date: string
  work_performed: string | null
  photos: number
  /** true when it needs a human (rejected by the server) rather than just waiting on signal */
  failed: boolean
  message: string | null
}

/** Logs saved on this phone that haven't fully reached the server yet. */
export async function listPendingLogs(): Promise<PendingLog[]> {
  const items = await getAllItems()
  return items.map(i => ({
    id: i.id,
    job_id: i.job_id,
    job_name: i.job_name ?? null,
    log_date: i.log_date,
    work_performed: i.work_performed,
    photos: i.photos.length,
    failed: !!i.failedReason,
    message: i.failedReason ?? i.lastError ?? null,
  }))
}

export async function enqueueLog(input: {
  job_id: string
  job_name?: string | null
  log_date: string
  work_performed: string | null
  cost_code: string | null
  photos: File[]
}) {
  const item: OutboxItem = {
    id: newId(),
    job_id: input.job_id,
    job_name: input.job_name ?? null,
    log_date: input.log_date,
    work_performed: input.work_performed,
    cost_code: input.cost_code,
    photos: input.photos.map((f, i) => ({ id: newId(), name: f.name || `photo-${i + 1}.jpg`, blob: f })),
    droppedPhotos: 0,
    created_at: new Date().toISOString(),
  }
  await putItem(item)
  emit({
    kind: 'saving',
    message: item.photos.length > 0 ? 'Log saved — photos uploading in background' : 'Log saved',
  })
  void processOutbox()
}

/** What's still sitting on this phone waiting to upload (for a persistent banner). */
export async function getOutboxSummary(): Promise<OutboxSummary> {
  const items = await getAllItems()
  const failedItems = items.filter(i => i.failedReason)
  const message = failedItems[0]?.failedReason ?? items.find(i => i.lastError)?.lastError ?? null
  return {
    pending: items.length,
    photos: items.reduce((n, i) => n + i.photos.length, 0),
    failed: failedItems.length,
    message,
  }
}

/** Clear permanent-failure flags and try everything again (user tapped Retry). */
export async function retryOutbox(): Promise<void> {
  const items = await getAllItems()
  for (const item of items) {
    if (item.failedReason) {
      item.failedReason = undefined
      await putItem(item)
    }
  }
  await processOutbox()
}

let running = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

export async function processOutbox(): Promise<void> {
  if (running) return
  running = true
  let needsRetry = false
  try {
    const items = await getAllItems()
    for (const item of items) {
      if (item.failedReason) continue
      try {
        if (!item.logId) {
          item.logId = await postLog(item)
          await putItem(item)
        }
        for (const photo of [...item.photos]) {
          // Never discard a photo on failure — keep it in the outbox so it can be retried/seen
          await postPhoto(item, photo)
          item.photos = item.photos.filter(p => p.id !== photo.id)
          item.lastError = undefined
          await putItem(item)
        }
        await deleteItem(item.id)
        window.dispatchEvent(new CustomEvent(LOG_DRAFT_SYNCED_EVENT, { detail: { synced: 1 } }))
        if (item.droppedPhotos > 0) {
          emit({ kind: 'failed', message: `Log sent, but ${item.droppedPhotos} photo(s) couldn't be uploaded` })
        } else {
          emit({ kind: 'synced', message: 'Log uploaded' })
        }
      } catch (e) {
        if (e instanceof PermanentError) {
          item.failedReason = e.message
          await putItem(item)
          emit({ kind: 'failed', message: `Log couldn't be sent: ${e.message}` })
        } else {
          needsRetry = true // network / server hiccup — keep everything, try again
          item.lastError = e instanceof Error ? e.message : 'Upload failed'
          await putItem(item)
        }
      }
    }
  } finally {
    running = false
    if (needsRetry && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        void processOutbox()
      }, RETRY_MS)
    }
  }
}
