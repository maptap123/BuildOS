'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API surface (not in lib.dom for all targets)
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

/**
 * Voice input via webkitSpeechRecognition (Chrome/Android, iOS Safari 17+).
 * Where unsupported the mic button should be hidden — the OS keyboard mic
 * still works in any text field.
 */
export function useSpeechInput(onFinalText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinalText)

  useEffect(() => {
    onFinalRef.current = onFinalText
  }, [onFinalText])

  useEffect(() => {
    const w = window as SpeechWindow
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
    return () => {
      try { recognitionRef.current?.stop() } catch {}
    }
  }, [])

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop() } catch {}
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const w = window as SpeechWindow
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript
      }
      if (text.trim()) onFinalRef.current(text.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)

    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, toggle, stop }
}
