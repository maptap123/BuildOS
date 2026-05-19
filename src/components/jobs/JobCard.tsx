import Link from 'next/link'
import { MapPin, Calendar } from 'lucide-react'
import { JobStatusBadge } from './JobStatusBadge'
import type { Job } from '@/types'

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function JobCard({ job, canSeeBudget }: { job: Job; canSeeBudget: boolean }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block bg-white rounded-xl border border-border p-4 shadow-sm hover:shadow-md hover:border-navy-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-navy-900 text-base leading-snug truncate">
            {job.name}
          </h3>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <p className="text-sm font-medium text-navy-700 mt-2">{job.client_name}</p>

      {job.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {job.tags.slice(0, 3).map(tag => (
            <span key={tag} className="rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700">
              {tag}
            </span>
          ))}
          {job.tags.length > 3 && (
            <span className="rounded bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              +{job.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5">
        <MapPin size={12} />
        <span className="truncate">{job.site_address}{job.city ? `, ${job.city}` : ''}</span>
      </div>

      <div className="flex items-center justify-between mt-3">
        {job.start_date ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar size={12} />
            <span>{fmtDate(job.start_date)}</span>
          </div>
        ) : <span />}

        {canSeeBudget && job.contract_amount != null && (
          <p className="text-sm font-bold text-navy-800">{fmt(job.contract_amount)}</p>
        )}
      </div>
    </Link>
  )
}
