'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Bot, Sparkles, X } from 'lucide-react'
import { JobPickerSheet } from '@/components/jobs'
import type { Job } from '@/types'

interface Props {
  jobId: string | null
  onClose: () => void
}

export function LogModePicker({ jobId, onClose }: Props) {
  const router = useRouter()
  const [showJobPicker, setShowJobPicker] = useState(false)
  const [pendingMode, setPendingMode] = useState<'traditional' | 'ai' | null>(null)

  function handleModeSelect(mode: 'traditional' | 'ai') {
    if (!jobId) {
      setPendingMode(mode)
      setShowJobPicker(true)
      return
    }
    openMode(mode, jobId)
  }

  function openMode(mode: 'traditional' | 'ai', jid: string) {
    onClose()
    if (mode === 'traditional') {
      router.push(`/jobs/${jid}/logs?newLog=1`)
    } else {
      router.push(`/jobs/${jid}/logs?newLog=1&aiMode=1`)
    }
  }

  function handleJobPicked(job: Job) {
    setShowJobPicker(false)
    if (pendingMode) openMode(pendingMode, job.id)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white"
        style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-[#1b2b4a] text-xl">Create Daily Log</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-[#1b2b4a] transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Traditional */}
            <button
              onClick={() => handleModeSelect('traditional')}
              className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-[#e2ddd6] bg-white text-left transition-all active:scale-[0.98] hover:border-[#1b2b4a]"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #1b2b4a, #2e4168)' }}
              >
                <FileText size={22} className="text-[#d4a83c]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1b2b4a] text-base">Traditional</p>
                <p className="text-[#4d6a9a] text-sm mt-0.5 leading-snug">
                  Fill out the standard log form — work notes, photos, crew info.
                </p>
              </div>
            </button>

            {/* AI Mode */}
            <button
              onClick={() => handleModeSelect('ai')}
              className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #1b2b4a 0%, #0f1d36 100%)',
                borderColor: 'rgba(212,168,60,0.4)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #c09030, #d4a83c)', boxShadow: '0 0 12px rgba(192,144,48,0.4)' }}
              >
                <Bot size={22} className="text-[#0b1623]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-bold text-white text-base">AI Log</p>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(212,168,60,0.2)', color: '#d4a83c', border: '1px solid rgba(212,168,60,0.3)' }}
                  >
                    <Sparkles size={9} />
                    BETA
                  </span>
                </div>
                <p className="text-[#4d6a9a] text-sm leading-snug">
                  Open the camera, talk and snap photos. Fixer writes the log for you when you&apos;re done.
                </p>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Inspired by Klutch AI — talk your log, skip the typing.
          </p>
        </div>
      </div>

      {/* Job picker if no job is selected */}
      {showJobPicker && (
        <JobPickerSheet
          onClose={() => { setShowJobPicker(false); onClose() }}
          currentJobId={null}
          onSelect={handleJobPicked}
        />
      )}
    </>
  )
}
