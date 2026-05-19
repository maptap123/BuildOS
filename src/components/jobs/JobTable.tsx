'use client'

import { useRouter } from 'next/navigation'
import { JobStatusBadge } from './JobStatusBadge'
import type { Job } from '@/types'

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function JobTable({ jobs, canSeeBudget }: { jobs: Job[]; canSeeBudget: boolean }) {
  const router = useRouter()

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center text-gray-400">
        No jobs match your filters.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-navy-900 text-white text-left text-xs uppercase tracking-wide">
            <th className="px-5 py-3.5 font-semibold">Job #</th>
            <th className="px-5 py-3.5 font-semibold">Name</th>
            <th className="px-5 py-3.5 font-semibold">Client</th>
            <th className="px-5 py-3.5 font-semibold">Status</th>
            <th className="px-5 py-3.5 font-semibold">Tags</th>
            <th className="px-5 py-3.5 font-semibold">Address</th>
            <th className="px-5 py-3.5 font-semibold">Start Date</th>
            {canSeeBudget && <th className="px-5 py-3.5 font-semibold text-right">Contract</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map(job => (
            <tr
              key={job.id}
              onClick={() => router.push(`/jobs/${job.id}`)}
              className="hover:bg-navy-50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3.5 font-mono text-navy-700 text-xs">{job.job_number}</td>
              <td className="px-5 py-3.5 font-semibold text-navy-900">{job.name}</td>
              <td className="px-5 py-3.5 text-gray-700">{job.client_name}</td>
              <td className="px-5 py-3.5"><JobStatusBadge status={job.status} /></td>
              <td className="px-5 py-3.5">
                {job.tags?.length ? (
                  <div className="flex max-w-44 flex-wrap gap-1">
                    {job.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                        {tag}
                      </span>
                    ))}
                    {job.tags.length > 2 && (
                      <span className="rounded bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        +{job.tags.length - 2}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-300">None</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-gray-600 max-w-48 truncate">
                {job.site_address}{job.city ? `, ${job.city}` : ''}
              </td>
              <td className="px-5 py-3.5 text-gray-600">
                {job.start_date ? fmtDate(job.start_date) : '—'}
              </td>
              {canSeeBudget && (
                <td className="px-5 py-3.5 text-navy-800 font-bold text-right">
                  {job.contract_amount != null ? fmt(job.contract_amount) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
