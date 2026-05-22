'use client'

import { useState } from 'react'
import { X, Bot, Sparkles, ArrowRight, Pencil } from 'lucide-react'
import type { DailyLog } from '@/types'

interface Props {
  jobId: string
  onClose: () => void
  onSaved: (log: DailyLog) => void
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

type Step = 'dictate' | 'review'

export function AiLogModal({ jobId, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('dictate')
  const [notes, setNotes] = useState('')
  const [polished, setPolished] = useState('')
  const [logDate, setLogDate] = useState(todayDate())
  const [thinking, setThinking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!notes.trim()) return
    setThinking(true)
    setError(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize_log', text: notes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const data = await res.json()
      setPolished(data.result ?? notes)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI failed — try again')
    } finally {
      setThinking(false)
    }
  }

  async function handleSave() {
    if (!polished.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, log_date: logDate, work_performed: polished.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const savedLog = await res.json() as DailyLog
      onSaved(savedLog)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 rounded-t-2xl md:rounded-t-xl"
          style={{ background: 'linear-gradient(135deg, #1b2b4a 0%, #0f1d36 100%)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)' }}
            >
              <Bot size={16} className="text-[#0b1623]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-display font-bold text-white text-sm leading-none">AI Log</p>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                  style={{ background: 'rgba(212,168,60,0.2)', color: '#d4a83c', border: '1px solid rgba(212,168,60,0.3)' }}
                >
                  <Sparkles size={8} />
                  BETA
                </span>
              </div>
              <p className="text-[#4d6a9a] text-[10px] mt-0.5">
                {step === 'dictate' ? 'Tell Hermes what happened — it writes the log' : 'Review & save your log'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Log Date</label>
            <input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1b2b4a] focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c]"
            />
          </div>

          {step === 'dictate' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  What happened today? <span className="text-gray-400 font-normal">(rough notes, voice-style — Hermes will clean it up)</span>
                </label>
                <textarea
                  autoFocus
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={9}
                  placeholder="e.g. poured the slab on the west side with 3 guys, took about 4 hours, had to wait on concrete delivery, used 6 yards, weather was hot, also roughed in the electrical conduit in the garage…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-[#1b2b4a] placeholder-gray-300 focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c] resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pb-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!notes.trim() || thinking}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)', color: '#0b1623' }}
                >
                  {thinking ? (
                    <>
                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-[#0b1623]/30 border-t-[#0b1623] rounded-full" />
                      Hermes is writing…
                    </>
                  ) : (
                    <>
                      Write Log
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-500">Hermes&apos; draft — edit freely</label>
                  <button
                    type="button"
                    onClick={() => setStep('dictate')}
                    className="flex items-center gap-1 text-[10px] font-medium text-[#4d6a9a] hover:text-[#1b2b4a] transition-colors"
                  >
                    <Pencil size={10} />
                    Re-dictate
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={polished}
                  onChange={e => setPolished(e.target.value)}
                  rows={10}
                  className="w-full border-2 border-[#d4a83c]/40 rounded-xl px-3 py-2.5 text-sm text-[#1b2b4a] focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c] resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pb-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!polished.trim() || saving}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)', color: 'white' }}
                >
                  {saving ? 'Saving…' : 'Save Log'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
