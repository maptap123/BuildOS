'use client'

import { useState, useEffect, useCallback } from 'react'
import { ExternalLink as ExternalLinkIcon, RefreshCw, CheckCircle, AlertCircle, Clock, Link2 } from 'lucide-react'

interface JobExternalLink {
  id: string
  provider: string
  display_name: string
  external_url: string | null
  link_type: string
  status: 'candidate' | 'linked' | 'rejected' | 'stale' | 'error'
  confidence: number | null
  created_at: string
}

interface JobSummary {
  id: string
  name: string
  sharepoint_folder_url: string | null
  documents_sync_status: 'not_linked' | 'candidate' | 'linked' | 'error'
  documents_sync_error: string | null
  documents_last_checked_at: string | null
}

interface ConnectedSystemsData {
  job: JobSummary
  links: JobExternalLink[]
}

interface Props {
  jobId: string
}

const STATUS_LABEL: Record<string, string> = {
  not_linked: 'Not linked',
  candidate:  'Review needed',
  linked:     'Linked',
  error:      'Error',
}

const STATUS_COLOR: Record<string, string> = {
  not_linked: 'text-gray-400',
  candidate:  'text-amber-500',
  linked:     'text-green-600',
  error:      'text-red-500',
}

function ProviderBadge({ status, count }: { status: string; count: number }) {
  const colorClass = STATUS_COLOR[status] ?? 'text-gray-400'
  return (
    <span className={`text-xs font-medium flex items-center gap-1 ${colorClass}`}>
      {status === 'linked' && <CheckCircle size={12} />}
      {status === 'candidate' && <Clock size={12} />}
      {status === 'error' && <AlertCircle size={12} />}
      {status === 'not_linked' && <Link2 size={12} />}
      {STATUS_LABEL[status] ?? status}
      {count > 0 && ` (${count})`}
    </span>
  )
}

export function ConnectedSystemsCard({ jobId }: Props) {
  const [data, setData] = useState<ConnectedSystemsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/connected-systems`)
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    } catch {
      // silently fail — table may not exist yet
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { fetchData() }, [fetchData])

  async function runAutoMatch() {
    setMatching(true)
    setMatchError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/connected-systems/auto-match`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setMatchError(json.error ?? 'Auto-match failed')
        return
      }
      const errors = [json.errors?.quickbooks, json.errors?.sharepoint].filter(Boolean)
      if (errors.length) setMatchError(errors.join(' | '))
      await fetchData()
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Auto-match failed')
    } finally {
      setMatching(false)
    }
  }

  const qbLinks   = data?.links.filter(l => l.provider === 'quickbooks' && l.status !== 'rejected') ?? []
  const spLinks   = data?.links.filter(l => l.provider === 'sharepoint' && l.status !== 'rejected') ?? []
  const qbLinked  = qbLinks.filter(l => l.status === 'linked')
  const spLinked  = spLinks.filter(l => l.status === 'linked')
  const qbStatus  = qbLinked.length > 0 ? 'linked' : qbLinks.length > 0 ? 'candidate' : 'not_linked'
  const spStatus  = data?.job.documents_sync_status ?? (spLinked.length > 0 ? 'linked' : spLinks.length > 0 ? 'candidate' : 'not_linked')
  const folderUrl = data?.job.sharepoint_folder_url ?? (spLinked[0]?.external_url ?? null)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="font-display font-semibold text-navy-900 text-base mb-4">Connected Systems</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-navy-900 text-base">Connected Systems</h3>
        <button
          onClick={runAutoMatch}
          disabled={matching}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gold-400 text-gold-600 hover:bg-gold-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={12} className={matching ? 'animate-spin' : ''} />
          {matching ? 'Matching…' : 'Auto-match'}
        </button>
      </div>

      {matchError && (
        <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{matchError}</p>
      )}

      <div className="space-y-3">
        {/* QuickBooks row */}
        <div className="flex items-center justify-between py-2 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-green-700">QB</span>
            </div>
            <span className="text-sm font-medium text-navy-800">QuickBooks</span>
          </div>
          <ProviderBadge status={qbStatus} count={qbLinked.length} />
        </div>

        {qbLinked.length > 0 && (
          <div className="pl-[34px] space-y-1">
            {qbLinked.map(link => (
              <p key={link.id} className="text-xs text-gray-500 truncate">{link.display_name}</p>
            ))}
          </div>
        )}

        {/* SharePoint row */}
        <div className="flex items-center justify-between py-2 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-blue-700">SP</span>
            </div>
            <span className="text-sm font-medium text-navy-800">SharePoint</span>
          </div>
          <ProviderBadge status={spStatus} count={spLinked.length} />
        </div>

        {folderUrl && (
          <div className="pl-[34px]">
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium transition-colors"
            >
              <ExternalLinkIcon size={12} />
              Open Folder
            </a>
          </div>
        )}

        {spLinks.filter(l => l.status === 'candidate').length > 0 && (
          <div className="pl-[34px]">
            <p className="text-xs text-amber-600">
              {spLinks.filter(l => l.status === 'candidate').length} candidate match(es) — admin review needed
            </p>
          </div>
        )}
      </div>

      {!data && (
        <p className="text-xs text-gray-400 mt-3">Run auto-match to search for linked records.</p>
      )}
    </div>
  )
}
