'use client'

import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw, ZapOff, Settings, Mic, MicOff } from 'lucide-react'
import type { DailyLog } from '@/types'

interface Props {
  jobId: string
  onClose: () => void
  onSaved: (log: DailyLog) => void
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

type Step = 'camera' | 'processing' | 'review'

export function AiLogModal({ jobId, onClose, onSaved }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const shouldListenRef = useRef(true)

  const [step, setStep] = useState<Step>('camera')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<File[]>([])
  const [capturedUrls, setCapturedUrls] = useState<string[]>([])
  const [polished, setPolished] = useState('')
  const [logDate, setLogDate] = useState(todayDate())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Camera
  useEffect(() => {
    if (step !== 'camera') return
    let cancelled = false

    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      } catch {}
    }
    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [facingMode, step])

  // Speech recognition
  useEffect(() => {
    if (step !== 'camera') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSpeechSupported(false); return }

    shouldListenRef.current = true
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e: any) => {
      let finalChunk = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      if (finalChunk) setTranscript(t => t + finalChunk)
      setInterimText(interim)
    }

    rec.onend = () => {
      if (shouldListenRef.current) {
        try { rec.start() } catch {}
      } else {
        setIsListening(false)
      }
    }

    try { rec.start(); setIsListening(true) } catch {}
    recognitionRef.current = rec

    return () => {
      shouldListenRef.current = false
      try { rec.stop() } catch {}
    }
  }, [step])

  function flipCamera() {
    setFacingMode(m => m === 'environment' ? 'user' : 'environment')
  }

  function toggleMic() {
    if (isListening) {
      shouldListenRef.current = false
      try { recognitionRef.current?.stop() } catch {}
      setIsListening(false)
    } else {
      shouldListenRef.current = true
      try { recognitionRef.current?.start(); setIsListening(true) } catch {}
    }
  }

  function snapPhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setCapturedPhotos(p => [...p, file])
      setCapturedUrls(p => [...p, URL.createObjectURL(blob)])
    }, 'image/jpeg', 0.85)
  }

  async function handleStop() {
    shouldListenRef.current = false
    try { recognitionRef.current?.stop() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStep('processing')

    const fullText = (transcript + ' ' + interimText).trim()

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize_log',
          text: fullText || 'Field crew documented work today with photos.',
        }),
      })
      if (!res.ok) throw new Error('AI error')
      const data = await res.json()
      setPolished(data.result ?? fullText)
    } catch {
      setPolished(fullText)
      setError('AI failed — edit manually')
    }
    setStep('review')
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
        throw new Error(body.error ?? 'Save failed')
      }
      const savedLog = await res.json() as DailyLog

      if (capturedPhotos.length > 0 && savedLog.id) {
        await Promise.all(capturedPhotos.map(file => {
          const fd = new FormData()
          fd.append('job_id', jobId)
          fd.append('log_id', savedLog.id)
          fd.append('file', file)
          return fetch('/api/photos', { method: 'POST', body: fd })
        }))
      }

      onSaved(savedLog)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  // ─── PROCESSING ──────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0b1623] flex flex-col items-center justify-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0b1623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <line x1="12" y1="7" x2="12" y2="11" />
            <line x1="8" y1="16" x2="8" y2="16" />
            <line x1="16" y1="16" x2="16" y2="16" />
          </svg>
        </div>
        <p className="text-white font-display font-bold text-xl mb-1">Hermes is writing…</p>
        <p className="text-[#4d6a9a] text-sm">Turning your voice into a daily log</p>
        <div className="mt-8 flex gap-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#d4a83c]"
              style={{ animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite` }}
            />
          ))}
        </div>
        <style>{`@keyframes dotBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
      </div>
    )
  }

  // ─── REVIEW ──────────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-2xl max-h-[92vh] flex flex-col">
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 rounded-t-2xl md:rounded-t-xl"
            style={{ background: 'linear-gradient(135deg, #1b2b4a 0%, #0f1d36 100%)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b1623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <line x1="12" y1="7" x2="12" y2="11" />
                </svg>
              </div>
              <div>
                <p className="font-display font-bold text-white text-sm leading-none">Review Your Log</p>
                <p className="text-[#4d6a9a] text-[10px] mt-0.5">Edit freely — this is your log</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Log Date</label>
              <input
                type="date"
                value={logDate}
                onChange={e => setLogDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1b2b4a] focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Hermes&apos; draft — edit freely</label>
              <textarea
                autoFocus
                value={polished}
                onChange={e => setPolished(e.target.value)}
                rows={9}
                className="w-full border-2 border-[#d4a83c]/40 rounded-xl px-3 py-2.5 text-sm text-[#1b2b4a] focus:outline-none focus:border-[#d4a83c] focus:ring-1 focus:ring-[#d4a83c] resize-none"
              />
            </div>

            {capturedUrls.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {capturedUrls.length} photo{capturedUrls.length !== 1 ? 's' : ''} captured
                </label>
                <div className="flex flex-wrap gap-2">
                  {capturedUrls.map((url, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => {
                          setCapturedPhotos(p => p.filter((_, j) => j !== i))
                          setCapturedUrls(p => p.filter((_, j) => j !== i))
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        </div>
      </div>
    )
  }

  // ─── CAMERA ──────────────────────────────────────────────────────────────
  const recentText = transcript.length > 90
    ? '…' + transcript.slice(-90) + (interimText ? ' ' + interimText : '')
    : (transcript + (interimText ? ' ' + interimText : '')).trim()
  const lastPhotoUrl = capturedUrls[capturedUrls.length - 1]

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-3">
        <button
          onClick={onClose}
          className="text-white font-semibold text-base"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
        >
          Done
        </button>
        <div className="flex items-center gap-6">
          <button onClick={flipCamera} className="text-white drop-shadow-md">
            <RotateCcw size={22} />
          </button>
          <button className="text-white drop-shadow-md">
            <ZapOff size={22} />
          </button>
          <button className="text-white drop-shadow-md">
            <Settings size={22} />
          </button>
        </div>
      </div>

      {/* Bottom panel */}
      <div
        className="relative z-10 mt-auto bg-black px-4 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
      >
        {/* Transcript pill */}
        <div className="bg-white rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 min-h-[54px]">
          <p className="flex-1 text-[#1b2b4a] text-sm font-medium leading-snug line-clamp-2">
            {recentText || 'Take pics and think out loud'}
          </p>
          <div className="flex items-end gap-[3px] shrink-0 h-5">
            {isListening
              ? [3, 7, 5, 9, 4].map((h, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-[#1b2b4a]"
                    style={{
                      height: `${h}px`,
                      animation: `barPulse 0.85s ${i * 0.11}s ease-in-out infinite alternate`,
                      opacity: 0.55 + i * 0.09,
                    }}
                  />
                ))
              : <span className="text-[11px] text-gray-300 font-medium">mic off</span>
            }
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex justify-center gap-1.5 mb-5">
          {['.5x', '1x', '2x'].map(z => (
            <div
              key={z}
              className="px-3 py-1 rounded-full text-xs font-bold select-none"
              style={z === '1x'
                ? { background: 'rgba(255,255,255,0.95)', color: '#1b2b4a' }
                : { background: 'rgba(255,255,255,0.18)', color: 'white' }
              }
            >
              {z}
            </div>
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-2 mb-5">
          {/* Last photo thumbnail */}
          <div className="relative w-[52px] h-[52px] rounded-xl overflow-hidden border-2 border-white/30 bg-white/10">
            {lastPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : null}
            {capturedUrls.length >= 2 && (
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                <span className="text-white text-xs font-bold">+{capturedUrls.length}</span>
              </div>
            )}
          </div>

          {/* Shutter */}
          <button
            onClick={snapPhoto}
            className="w-[76px] h-[76px] rounded-full bg-white active:scale-95 transition-transform"
            style={{ boxShadow: '0 0 0 5px rgba(255,255,255,0.32)' }}
          />

          {/* Mic toggle */}
          <button
            onClick={speechSupported ? toggleMic : undefined}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center border active:scale-95 transition-transform"
            style={isListening
              ? { background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' }
              : { background: 'rgba(212,168,60,0.15)', borderColor: 'rgba(212,168,60,0.45)' }
            }
          >
            {isListening
              ? <Mic size={22} className="text-white" />
              : <MicOff size={22} className="text-[#d4a83c]" />
            }
          </button>
        </div>

        {/* Stop & Write */}
        <button
          onClick={handleStop}
          className="w-full py-3.5 rounded-2xl text-sm font-bold active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)', color: '#0b1623' }}
        >
          Stop &amp; Write Log
        </button>
      </div>

      <style>{`
        @keyframes barPulse {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1.6); }
        }
      `}</style>
    </div>
  )
}
