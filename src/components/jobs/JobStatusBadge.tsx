import type { JobStatus } from '@/types'

const config: Record<JobStatus, { label: string; className: string }> = {
  lead:     { label: 'Lead',     className: 'bg-gray-100 text-gray-600'      },
  presale:  { label: 'Presale',  className: 'bg-blue-100 text-blue-700'      },
  active:   { label: 'Active',   className: 'bg-emerald-100 text-emerald-700' },
  warranty: { label: 'Warranty', className: 'bg-amber-100 text-amber-700'    },
  closed:   { label: 'Closed',   className: 'bg-gray-200 text-gray-500'     },
  archived: { label: 'Archived', className: 'bg-orange-100 text-orange-600'  },
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, className } = config[status] ?? config.lead
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
