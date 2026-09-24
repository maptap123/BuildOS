'use client'

import type { JobBillingRecord, JobBillingType } from '@/types'

// Client billing mirrored read-only from QuickBooks (job_billing). QB is the
// source of truth, so nothing here is editable — changes are made in QuickBooks
// and arrive via the webhook / daily pull.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const LABEL: Record<JobBillingType, string> = {
  Invoice: 'Invoice',
  Payment: 'Payment',
  CreditMemo: 'Credit memo',
  SalesReceipt: 'Sales receipt',
  RefundReceipt: 'Refund',
}

const BADGE: Record<JobBillingType, string> = {
  Invoice: 'bg-blue-50 text-blue-700',
  Payment: 'bg-green-50 text-green-700',
  CreditMemo: 'bg-amber-50 text-amber-700',
  SalesReceipt: 'bg-green-50 text-green-700',
  RefundReceipt: 'bg-red-50 text-red-700',
}

/** Status line for a record, from QB's own balances. `invoiceNo` maps QB invoice id → invoice number. */
function statusOf(r: JobBillingRecord, invoiceNo: Map<string, string | null>): { text: string; tone: 'good' | 'warn' | 'muted' } | null {
  const bal = Number(r.balance ?? 0)
  if (r.qb_txn_type === 'Invoice') {
    if (bal <= 0.005) return { text: 'Paid', tone: 'good' }
    if (bal < Number(r.amount)) return { text: `${fmt(bal)} open`, tone: 'warn' }
    return { text: r.due_date ? `Open · due ${fmtDate(r.due_date)}` : 'Open', tone: 'warn' }
  }
  if (r.qb_txn_type === 'Payment') {
    if (bal > 0.005) return { text: `${fmt(bal)} deposit, not yet applied`, tone: 'muted' }
    const nos = (r.linked_invoice_ids ?? []).map((id) => invoiceNo.get(id)).filter(Boolean)
    return nos.length ? { text: `Applied to #${nos.join(', #')}`, tone: 'muted' } : null
  }
  if (r.qb_txn_type === 'CreditMemo' && bal > 0.005) return { text: `${fmt(bal)} credit unused`, tone: 'muted' }
  return null
}

const TONE = { good: 'text-green-700', warn: 'text-amber-700', muted: 'text-gray-500' }

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'good' }) {
  const box = tone === 'warn' ? 'border-amber-200 bg-amber-50' : tone === 'good' ? 'border-green-200 bg-green-50' : 'border-border bg-white'
  const val = tone === 'warn' ? 'text-amber-800' : tone === 'good' ? 'text-green-700' : 'text-navy-900'
  return (
    <div className={`rounded-xl border px-4 py-3 ${box}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`font-display font-semibold text-lg leading-tight tabular-nums ${val}`}>{value}</p>
      {sub && <p className="text-xs mt-0.5 text-gray-400">{sub}</p>}
    </div>
  )
}

export function QBBillingPanel({ records }: { records: JobBillingRecord[] }) {
  const sum = (types: JobBillingType[], field: 'amount' | 'balance' = 'amount') =>
    records.filter((r) => types.includes(r.qb_txn_type)).reduce((s, r) => s + Number(r[field] ?? 0), 0)

  const billed   = sum(['Invoice', 'SalesReceipt']) - sum(['CreditMemo', 'RefundReceipt'])
  const received = sum(['Payment', 'SalesReceipt']) - sum(['RefundReceipt'])
  const owed     = sum(['Invoice'], 'balance')
  const deposits = sum(['Payment'], 'balance')
  const invoiceCount = records.filter((r) => r.qb_txn_type === 'Invoice').length
  const invoiceNo = new Map(records.filter((r) => r.qb_txn_type === 'Invoice').map((r) => [r.qb_txn_id, r.doc_number]))
  const hasDeposits = deposits > 0.005

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-900">Invoices &amp; payments</h3>
        <span className="text-[11px] text-gray-400">From QuickBooks · edit in QuickBooks</span>
      </div>

      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No invoices or payments in QuickBooks for this job yet.
          <p className="text-xs text-gray-400 mt-1">They appear here within a minute of being entered in QuickBooks.</p>
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${hasDeposits ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            <Metric label="Billed" value={fmt(billed)} sub={`${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`} />
            <Metric label="Received" value={fmt(received)} tone={received > 0 ? 'good' : undefined} />
            {/* three cards on a 2-column phone grid: let the last one span the row */}
            <div className={hasDeposits ? '' : 'max-md:col-span-2'}>
              <Metric label="Still owed" value={fmt(owed)} sub="open invoice balance" tone={owed > 0.005 ? 'warn' : undefined} />
            </div>
            {hasDeposits && <Metric label="Deposits not yet invoiced" value={fmt(deposits)} sub="received, not applied to an invoice" />}
          </div>

          {/* Mobile: stacked cards */}
          <ul className="md:hidden space-y-2">
            {records.map((r) => {
              const st = statusOf(r, invoiceNo)
              return (
                <li key={r.id} className="rounded-xl border border-border bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${BADGE[r.qb_txn_type]}`}>
                      {LABEL[r.qb_txn_type]}{r.doc_number ? ` #${r.doc_number}` : ''}
                    </span>
                    <span className="font-semibold tabular-nums text-navy-900">{fmt(Number(r.amount))}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-500">{fmtDate(r.txn_date)}</span>
                    {st && <span className={TONE[st.tone]}>{st.text}</span>}
                  </div>
                  {r.description && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{r.description}</p>}
                </li>
              )
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-border">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const st = statusOf(r, invoiceNo)
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtDate(r.txn_date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${BADGE[r.qb_txn_type]}`}>
                          {LABEL[r.qb_txn_type]}{r.doc_number ? ` #${r.doc_number}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-md truncate">{r.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-navy-900">{fmt(Number(r.amount))}</td>
                      <td className={`px-4 py-2.5 text-xs ${st ? TONE[st.tone] : 'text-gray-400'}`}>{st?.text ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
