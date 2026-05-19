'use client'

import { useState } from 'react'
import {
  BookOpen,
  Cloud,
  Thermometer,
  Users,
  AlertTriangle,
  ShieldCheck,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Sparkles,
  Images,
  X,
  Camera,
} from 'lucide-react'
import type { DailyLog, LogPhoto } from '@/types'
import { LogPhotoUploader } from './LogPhotoUploader'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  logs: DailyLog[]
  photos?: LogPhoto[]
  permissions: Permissions
  onAdd: () => void
  onEdit: (log: DailyLog) => void
  onDelete: (id: string) => void
  onRefreshPhotos?: () => void
}

function formatLogDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCreatedAt(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function PhotoLightbox({ photos, startIndex, onClose }: { photos: LogPhoto[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex)
  const photo = photos[idx]
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
        <X size={24} />
      </button>
      {idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i - 1) }}
          className="absolute left-4 text-white/70 hover:text-white text-3xl font-light px-3 py-2"
        >‹</button>
      )}
      {idx < photos.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i + 1) }}
          className="absolute right-12 text-white/70 hover:text-white text-3xl font-light px-3 py-2"
        >›</button>
      )}
      <div onClick={e => e.stopPropagation()} className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url ?? ''} alt={photo.file_name ?? ''} className="max-h-[80vh] max-w-full object-contain rounded-lg" />
        {photo.file_name && <p className="text-white/50 text-xs">{photo.file_name}</p>}
        <p className="text-white/40 text-xs">{idx + 1} / {photos.length}</p>
      </div>
    </div>
  )
}

function LogCard({
  log,
  logPhotos,
  permissions,
  onEdit,
  onDelete,
  onRefreshPhotos,
}: {
  log: DailyLog
  logPhotos: LogPhoto[]
  permissions: Permissions
  onEdit: (log: DailyLog) => void
  onDelete: (id: string) => void
  onRefreshPhotos?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const hasExtras = log.delays || log.safety_notes || log.inspection_notes

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">

      {/* Card header: date + actions */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <p className="font-display font-bold text-navy-900 text-base leading-tight">
            {formatLogDate(log.log_date)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {log.author_name && (
              <span className="font-medium text-navy-500">{log.author_name} · </span>
            )}
            Logged at {formatCreatedAt(log.logged_at ?? log.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Weather row */}
          {(log.weather_summary || log.temperature_high != null) && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
              <Cloud size={13} className="text-gray-400" />
              {log.weather_summary && <span>{log.weather_summary}</span>}
              {log.temperature_high != null && (
                <span className="flex items-center gap-0.5">
                  <Thermometer size={11} className="text-orange-400" />
                  {log.temperature_high}°
                  {log.temperature_low != null && (
                    <span className="text-gray-400">/{log.temperature_low}°</span>
                  )}
                </span>
              )}
            </div>
          )}

          {permissions.can_create && (
            <button
              onClick={() => setShowUploader(v => !v)}
              className="text-gray-300 hover:text-gold-500 transition-colors p-1"
              title="Add photos to this log"
            >
              <Camera size={14} />
            </button>
          )}
          {permissions.can_edit && (
            <button
              onClick={() => onEdit(log)}
              className="text-gray-300 hover:text-navy-600 transition-colors p-1"
              title="Edit log"
            >
              <Pencil size={14} />
            </button>
          )}
          {permissions.can_delete && (
            <button
              onClick={() => onDelete(log.id)}
              className="text-gray-300 hover:text-red-500 transition-colors p-1"
              title="Delete log"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile weather row */}
      {(log.weather_summary || log.temperature_high != null) && (
        <div className="sm:hidden flex items-center gap-2 px-5 pt-3 text-xs text-gray-500">
          <Cloud size={13} className="text-gray-400" />
          {log.weather_summary && <span>{log.weather_summary}</span>}
          {log.temperature_high != null && (
            <span className="flex items-center gap-0.5">
              <Thermometer size={11} className="text-orange-400" />
              {log.temperature_high}°
              {log.temperature_low != null && (
                <span className="text-gray-400">/{log.temperature_low}°</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="px-5 py-4 space-y-4">

        {/* Manpower */}
        {log.manpower_count != null && (
          <div className="flex items-center gap-2">
            <Users size={14} className="text-navy-400 shrink-0" />
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-navy-900">{log.manpower_count}</span> worker{log.manpower_count !== 1 ? 's' : ''} on site
            </span>
          </div>
        )}

        {/* AI summary — shown above raw notes when present */}
        {log.ai_summary && (
          <div className="bg-navy-50 border border-navy-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={12} className="text-gold-500" />
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">PM Summary</p>
            </div>
            <p className="text-sm text-navy-800 leading-relaxed">{log.ai_summary}</p>
          </div>
        )}

        {/* Work performed */}
        {log.work_performed && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Work Performed</p>
            <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap">{log.work_performed}</p>
          </div>
        )}

        {/* Per-log photos */}
        {logPhotos.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-2">
              {logPhotos.slice(0, 8).map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxIdx(i)}
                  className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 hover:opacity-90 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url ?? ''} alt={photo.file_name ?? ''} className="w-full h-full object-cover" />
                  {i === 7 && logPhotos.length > 8 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-semibold">
                      +{logPhotos.length - 8}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {lightboxIdx !== null && (
          <PhotoLightbox photos={logPhotos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}

        {/* Inline photo uploader for this log */}
        {showUploader && (
          <div className="border border-dashed border-gold-300 rounded-xl px-4 py-3 bg-gold-50/40">
            <p className="text-[10px] font-semibold text-gold-600 uppercase tracking-wide mb-2">Add Photos</p>
            <LogPhotoUploader
              logId={log.id}
              jobId={log.job_id}
              onUploaded={() => {
                setShowUploader(false)
                onRefreshPhotos?.()
              }}
            />
          </div>
        )}

        {/* Expandable extras */}
        {hasExtras && (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-navy-600 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Hide details' : 'Show delays, safety & inspection notes'}
            </button>

            {expanded && (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                {log.delays && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={13} className="text-amber-500" />
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Delays</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap pl-5">{log.delays}</p>
                  </div>
                )}
                {log.safety_notes && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShieldCheck size={13} className="text-green-600" />
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Safety</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap pl-5">{log.safety_notes}</p>
                  </div>
                )}
                {log.inspection_notes && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ClipboardCheck size={13} className="text-blue-600" />
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Inspection</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap pl-5">{log.inspection_notes}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function LogFeed({ logs, photos = [], permissions, onAdd, onEdit, onDelete, onRefreshPhotos }: Props) {
  const [galleryIdx, setGalleryIdx] = useState<number | null>(null)

  // Map direct uploads and Buildertrend-imported photos to the matching log.
  const photosByLog = new Map<string, LogPhoto[]>()
  const logIdByBtLogId = new Map<string, string>()
  for (const log of logs) {
    if (log.bt_log_id) logIdByBtLogId.set(log.bt_log_id, log.id)
  }

  const jobLevelPhotos: LogPhoto[] = []
  for (const p of photos) {
    const logId = p.log_id ?? (p.bt_log_id ? logIdByBtLogId.get(p.bt_log_id) : undefined)
    if (logId) {
      const arr = photosByLog.get(logId) ?? []
      arr.push(p)
      photosByLog.set(logId, arr)
    } else {
      jobLevelPhotos.push(p)
    }
  }

  if (logs.length === 0 && jobLevelPhotos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-navy-900 text-base">Daily Logs</h2>
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              + Add Log
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <BookOpen size={32} className="text-gray-200" />
          No logs yet — be the first to report on site
          {permissions.can_create && (
            <button
              onClick={onAdd}
              className="mt-2 text-gold-600 hover:text-gold-700 font-medium text-sm transition-colors"
            >
              Add today&apos;s log →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-navy-900 text-base">
          Daily Logs
          <span className="ml-2 text-xs font-sans font-normal text-gray-400">
            {logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}
          </span>
        </h2>
        {permissions.can_create && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            + Add Log
          </button>
        )}
      </div>

      {/* Job-level photo gallery (BT-imported photos without log association) */}
      {jobLevelPhotos.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
            <Images size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Job Photos
            </span>
            <span className="text-xs text-gray-400">{jobLevelPhotos.length}</span>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {jobLevelPhotos.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setGalleryIdx(i)}
                className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url ?? ''} alt={photo.file_name ?? ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {galleryIdx !== null && (
        <PhotoLightbox photos={jobLevelPhotos} startIndex={galleryIdx} onClose={() => setGalleryIdx(null)} />
      )}

      {/* Feed */}
      {logs.map(log => (
        <LogCard
          key={log.id}
          log={log}
          logPhotos={photosByLog.get(log.id) ?? []}
          permissions={permissions}
          onEdit={onEdit}
          onDelete={onDelete}
          onRefreshPhotos={onRefreshPhotos}
        />
      ))}
    </div>
  )
}
