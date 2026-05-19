import { createAdminClient } from '@/lib/supabase/admin'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { ApprovalButtons } from './ApprovalButtons'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const TYPE_CONFIG = {
  additive:  { label: 'Addition',   badge: 'bg-green-100 text-green-800',  prefix: '+' },
  deductive: { label: 'Deduction',  badge: 'bg-red-100 text-red-700',      prefix: '−' },
  neutral:   { label: 'Neutral',    badge: 'bg-gray-100 text-gray-600',    prefix: '' },
}

interface CORow {
  co_number: string
  title: string
  description: string | null
  status: string
  type: 'additive' | 'deductive' | 'neutral'
  amount: number
  reason: string | null
  submitted_date: string | null
  approved_date: string | null
  client_token: string
  client_approved_at: string | null
  client_rejected_at: string | null
  client_name: string | null
  job: {
    name: string
    client_name: string
    site_address: string
    city: string | null
    state: string | null
    postal_code: string | null
  } | null
}

export default async function COApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('change_orders')
    .select(`
      co_number,
      title,
      description,
      status,
      type,
      amount,
      reason,
      submitted_date,
      approved_date,
      client_token,
      client_approved_at,
      client_rejected_at,
      client_name,
      job:job_id (
        name,
        client_name,
        site_address,
        city,
        state,
        postal_code
      )
    `)
    .eq('client_token', token)
    .single()

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="text-gray-300 mb-4">
            <XCircle size={56} className="mx-auto" />
          </div>
          <h1 className="text-xl font-semibold text-gray-700 mb-2">Change Order Not Found</h1>
          <p className="text-gray-400 text-sm">
            This link may be invalid or expired. Please contact your project manager.
          </p>
        </div>
      </div>
    )
  }

  const co = data as unknown as CORow
  const job = co.job
  const typeCfg = TYPE_CONFIG[co.type] ?? TYPE_CONFIG.neutral

  const addressParts = [
    job?.site_address,
    job?.city,
    job?.state,
    job?.postal_code,
  ].filter(Boolean).join(', ')

  const clientDisplayName = co.client_name ?? job?.client_name ?? 'Client'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#0f2a4a] text-white py-5 px-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-medium tracking-widest text-blue-300 uppercase mb-1">JDC Construction</p>
          <h1 className="text-lg font-bold">Change Order Approval</h1>
        </div>
      </header>

      <main className="flex-1 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* CO Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Title bar */}
            <div className="bg-[#0f2a4a] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    {co.co_number}
                  </p>
                  <h2 className="text-white text-xl font-bold leading-snug">{co.title}</h2>
                </div>
                <span className={`shrink-0 mt-1 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${typeCfg.badge}`}>
                  {typeCfg.label}
                </span>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Job info */}
              {job && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                  <p className="font-semibold text-gray-700">{job.name}</p>
                  {addressParts && <p className="text-gray-500">{addressParts}</p>}
                  <p className="text-gray-500">Client: {clientDisplayName}</p>
                </div>
              )}

              {/* Amount */}
              <div className="text-center py-4 border-y border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Amount</p>
                <p className={`text-4xl font-bold ${co.type === 'additive' ? 'text-green-600' : co.type === 'deductive' ? 'text-red-600' : 'text-gray-700'}`}>
                  {typeCfg.prefix}{fmt(co.amount)}
                </p>
              </div>

              {/* Reason */}
              {co.reason && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description of Work</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{co.reason}</p>
                </div>
              )}

              {/* Dates */}
              {co.submitted_date && (
                <div className="text-xs text-gray-400">
                  Submitted:{' '}
                  {new Date(co.submitted_date).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </div>
              )}
            </div>

            {/* Status / Action area */}
            <div className="border-t border-gray-100 px-6 py-6">
              {co.status === 'approved' || co.client_approved_at ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <CheckCircle className="text-green-500" size={40} />
                  <p className="font-semibold text-green-700 text-lg">Approved</p>
                  {(co.approved_date ?? co.client_approved_at) && (
                    <p className="text-sm text-gray-400">
                      {new Date(co.client_approved_at ?? co.approved_date!).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              ) : co.client_rejected_at ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <XCircle className="text-red-400" size={40} />
                  <p className="font-semibold text-red-600 text-lg">Declined</p>
                  <p className="text-sm text-gray-400">
                    {new Date(co.client_rejected_at).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
              ) : co.status === 'rejected' || co.status === 'voided' ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <XCircle className="text-gray-400" size={40} />
                  <p className="font-semibold text-gray-600 text-lg capitalize">{co.status}</p>
                </div>
              ) : co.status === 'draft' ? (
                <div className="flex flex-col items-center gap-3 py-2 text-gray-400">
                  <Clock size={36} />
                  <p className="text-sm">This change order is not yet ready for approval.</p>
                </div>
              ) : (
                /* status === 'submitted' — show interactive buttons */
                <div className="space-y-4">
                  <p className="text-center text-sm text-gray-500">
                    Please review the change order above and click Approve or Decline.
                  </p>
                  <ApprovalButtons token={token} status={co.status} />
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">Powered by JDC Platform</p>
      </footer>
    </div>
  )
}
