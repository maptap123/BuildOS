'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, MapPin, X } from 'lucide-react'

interface Props {
  address: string
  title?: string
  onClose: () => void
}

/** Popup shown when someone taps a map icon: shows the address, offers Google Maps or copy. */
export function AddressDialog({ address, title = 'Address', onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = address
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full md:w-[400px] rounded-t-2xl md:rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-lg font-bold text-navy-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-11 h-11 -mr-2 rounded-lg text-gray-400 hover:text-navy-900 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
            <MapPin size={16} className="mt-0.5 text-gold-500 shrink-0" />
            <p className="text-sm text-navy-900 leading-relaxed break-words select-all">{address}</p>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 active:bg-navy-950 transition-colors"
          >
            <MapPin size={16} className="text-gold-400" />
            Open in Google Maps
          </a>
          <button
            type="button"
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-navy-200 text-navy-700 text-sm font-semibold hover:bg-navy-50 active:bg-navy-100 transition-colors"
          >
            {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
        </div>
      </div>
    </div>
  )
}
