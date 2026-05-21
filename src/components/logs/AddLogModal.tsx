'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Loader2, Camera, Trash2, CloudSun, RefreshCw } from 'lucide-react'
import type { DailyLog } from '@/types'

interface Props {
  jobId: string
  log?: DailyLog | null
  onClose: () => void
  onSaved: () => void
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

type FormState = {
  log_date: string
  work_performed: string
  manpower_count: string
  weather_summary: string
  temperature_high: string
  temperature_low: string
  delays: string
  safety_notes: string
  inspection_notes: string
}

export function AddLogModal({ jobId, log, onClose, onSaved }: Props) {
  const isEdit = Boolean(log)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null)
  const [weatherEdited, setWeatherEdited] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>({
    log_date:         log?.log_date ?? todayDate(),
    work_performed:   log?.work_performed ?? '',
    manpower_count:   log?.manpower_count != null ? String(log.manpower_count) : '',
    weather_summary:  log?.weather_summary ?? '',
    temperature_high: log?.temperature_high != null ? String(log.temperature_high) : '',
    temperature_low:  log?.temperature_low != null ? String(log.temperature_low) : '',
    delays:           log?.delays ?? '',
    safety_notes:     log?.safety_notes ?? '',
    inspection_notes: log?.inspection_notes ?? '',
  })

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (aiSummary) setAiSummary(null)
    if (field === 'weather_summary' || field === 'temperature_high' || field === 'temperature_low') {
      setWeatherMessage(null)
      setWeatherEdited(true)
    }
  }

  async function pullWeather(force = false) {
    if (!form.log_date || weatherLoading) return
    if (!force && weatherEdited) return

    setWeatherLoading(true)
    setWeatherMessage(null)
    try {
      const params = new URLSearchParams({ job_id: jobId, date: form.log_date })
      const res = await fetch(`/api/weather?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Weather lookup failed')

      setForm(f => ({
        ...f,
        weather_summary: body.weather_summary ?? f.weather_summary,
        temperature_high: body.temperature_high != null ? String(body.temperature_high) : f.temperature_high,
        temperature_low: body.temperature_low != null ? String(body.temperature_low) : f.temperature_low,
      }))
      setWeatherEdited(false)
      if (body.location) setWeatherMessage(`Pulled from ${body.location}`)
    } catch (e) {
      setWeatherMessage(e instanceof Error ? e.message : 'Weather lookup failed')
    } finally {
      setWeatherLoading(false)
    }
  }

  useEffect(() => {
    if (!isEdit) void pullWeather(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, form.log_date, isEdit])

  async function generateSummary() {
    if (!form.work_performed.trim()) return
    setAiLoading(true)
    setAiSummary(null)
    try {
      const parts = [
        `Work performed: ${form.work_performed}`,
        form.delays ? `Delays: ${form.delays}` : null,
        form.safety_notes ? `Safety notes: ${form.safety_notes}` : null,
        form.inspection_notes ? `Inspection notes: ${form.inspection_notes}` : null,
        form.manpower_count ? `Workers on site: ${form.manpower_count}` : null,
      ].filter(Boolean).join('\n')

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize_log', text: parts }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'AI error')
      setAiSummary(body.result)
    } catch (e) {
      setAiSummary(null)
      setError(e instanceof Error ? e.message : 'AI summary failed')
    } finally {
      setAiLoading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.work_performed.trim()) {
      setError('Work performed is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...(isEdit ? { id: log!.id } : { job_id: jobId }),
        log_date:         form.log_date,
        work_performed:   form.work_performed.trim(),
        weather_summary:  form.weather_summary.trim() || null,
        temperature_high: form.temperature_high !== '' ? Number(form.temperature_high) : null,
        temperature_low:  form.temperature_low !== '' ? Number(form.temperature_low) : null,
        manpower_count:   form.manpower_count !== '' ? Number(form.manpower_count) : null,
        delays:           form.delays.trim() || null,
        safety_notes:     form.safety_notes.trim() || null,
        inspection_notes: form.inspection_notes.trim() || null,
        ai_summary:       aiSummary || null,
      }
      const res = await fetch('/api/logs', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }

      // Upload photos if any
      if (photos.length > 0 && !isEdit) {
        const { id: logId } = await res.clone().json().catch(() => ({}))
        if (logId) {
          await Promise.all(photos.map(file => {
            const fd = new FormData()
            fd.append('job_id', jobId)
            fd.append('log_id', logId)
            fd.append('file', file)
            return fetch('/api/photos', { method: 'POST', body: fd })
          }))
        }
      }

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-display font-semibold text-navy-900 text-base">
            {isEdit ? 'Edit Log' : 'Add Daily Log'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Date *</label>
            <input
              type="date"
              required
              value={form.log_date}
              onChange={e => set('log_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          {/* Work performed — primary field */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Work Performed *</label>
            <textarea
              required
              autoFocus={!isEdit}
              value={form.work_performed}
              onChange={e => set('work_performed', e.target.value)}
              rows={5}
              placeholder="What did the crew accomplish today? Include trades, locations, materials used…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {/* AI Summarize */}
          <div>
            <button
              type="button"
              onClick={generateSummary}
              disabled={aiLoading || !form.work_performed.trim()}
              className="flex items-center gap-2 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              {aiLoading
                ? <Loader2 size={13} className="animate-spin" />
                : <Sparkles size={13} className="text-gold-500" />
              }
              {aiLoading ? 'Generating PM summary…' : 'AI: Generate PM summary'}
            </button>

            {aiSummary && (
              <div className="mt-2 bg-navy-50 border border-navy-100 rounded-lg px-4 py-3">
                <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide mb-1">PM Summary Preview</p>
                <p className="text-sm text-navy-800 leading-relaxed">{aiSummary}</p>
              </div>
            )}
          </div>

          {/* Photos */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Photos</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  setPhotos(prev => [...prev, ...files])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs font-semibold text-navy-700 border border-navy-200 hover:border-navy-400 hover:bg-navy-50 px-3 py-2 rounded-lg transition-colors"
              >
                <Camera size={13} className="text-gold-500" />
                Add Photos
              </button>
              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((file, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manpower */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Workers on Site</label>
            <input
              type="number"
              min="0"
              max="999"
              value={form.manpower_count}
              onChange={e => set('manpower_count', e.target.value)}
              placeholder="e.g. 4"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
            />
          </div>

          {/* Weather row */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label className="block text-xs font-medium text-gray-600">Weather</label>
              <button
                type="button"
                onClick={() => pullWeather(true)}
                disabled={weatherLoading || !form.log_date}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-navy-700 hover:text-navy-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {weatherLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {weatherLoading ? 'Pulling weather' : 'Auto-pull'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 sm:col-span-1 relative">
                <CloudSun size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={form.weather_summary}
                  onChange={e => set('weather_summary', e.target.value)}
                  placeholder="e.g. Partly Cloudy with Showers, 0.25&quot; precip, 10 mph wind"
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                />
              </div>
              <input
                type="number"
                value={form.temperature_high}
                onChange={e => set('temperature_high', e.target.value)}
                placeholder="High °F"
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
              <input
                type="number"
                value={form.temperature_low}
                onChange={e => set('temperature_low', e.target.value)}
                placeholder="Low °F"
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
              />
            </div>
            {weatherMessage && (
              <p className="mt-1.5 text-[11px] text-gray-400">{weatherMessage}</p>
            )}
          </div>

          {/* Delays */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Delays / Issues</label>
            <textarea
              value={form.delays}
              onChange={e => set('delays', e.target.value)}
              rows={2}
              placeholder="Any delays, blocked work, or issues that need follow-up…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {/* Safety notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Safety Notes</label>
            <textarea
              value={form.safety_notes}
              onChange={e => set('safety_notes', e.target.value)}
              rows={2}
              placeholder="PPE compliance, incidents, hazards observed…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {/* Inspection notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Inspection Notes</label>
            <textarea
              value={form.inspection_notes}
              onChange={e => set('inspection_notes', e.target.value)}
              rows={2}
              placeholder="Inspector name, result, items flagged…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 placeholder-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
