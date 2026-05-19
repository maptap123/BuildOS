import { createAdminClient } from '@/lib/supabase/admin'
import { CheckCircle, Clock, FileText, XCircle } from 'lucide-react'
import { ProposalResponseForm } from './ProposalResponseForm'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

interface ProposalLine {
  id: string
  description: string
  phase: string | null
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
  sort_order: number
  notes: string | null
}

interface ProposalRow {
  id: string
  lead_id: string | null
  job_name: string
  job_type: string
  markup_pct: number
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'voided'
  scope_text: string | null
  title: string | null
  version: number
  notes: string | null
  public_token: string
  client_approved_at: string | null
  client_rejected_at: string | null
  client_name: string | null
  client_signature: string | null
  client_response_note: string | null
  created_at: string
  updated_at: string
  lead: {
    title: string
    client_name: string | null
    client_email: string | null
    client_phone: string | null
    address: string | null
  } | null
  lines: ProposalLine[]
}

function lineTotal(line: ProposalLine) {
  return Number(line.quantity) * Number(line.unit_cost) * (1 + Number(line.markup_pct) / 100)
}

function groupedLines(lines: ProposalLine[]) {
  const map = new Map<string, ProposalLine[]>()
  for (const line of [...lines].sort((a, b) => a.sort_order - b.sort_order)) {
    const phase = line.phase ?? 'Project'
    map.set(phase, [...(map.get(phase) ?? []), line])
  }
  return Array.from(map.entries())
}

function responseDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('estimates')
    .select(`
      id,
      lead_id,
      job_name,
      job_type,
      markup_pct,
      status,
      scope_text,
      title,
      version,
      notes,
      public_token,
      client_approved_at,
      client_rejected_at,
      client_name,
      client_signature,
      client_response_note,
      created_at,
      updated_at,
      lead:lead_id (
        title,
        client_name,
        client_email,
        client_phone,
        address
      ),
      lines:estimate_lines (
        id,
        description,
        phase,
        uom,
        quantity,
        unit_cost,
        markup_pct,
        sort_order,
        notes
      )
    `)
    .eq('public_token', token)
    .single()

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <XCircle size={56} className="mx-auto mb-4 text-gray-300" />
          <h1 className="text-xl font-semibold text-gray-700 mb-2">Proposal Not Found</h1>
          <p className="text-gray-400 text-sm">
            This link may be invalid or expired. Please contact your project manager.
          </p>
        </div>
      </div>
    )
  }

  const proposal = data as unknown as ProposalRow
  const title = proposal.title ?? proposal.job_name ?? proposal.lead?.title ?? `Proposal v${proposal.version}`
  const clientName = proposal.client_name ?? proposal.lead?.client_name ?? 'Client'
  const total = proposal.lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const statusLabel = proposal.status === 'approved' ? 'Accepted' : proposal.status === 'rejected' ? 'Declined' : proposal.status

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0f2a4a] text-white py-5 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-medium tracking-widest text-blue-300 uppercase mb-1">JDC Construction</p>
          <h1 className="text-lg font-bold">Proposal Review</h1>
        </div>
      </header>

      <main className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-[#0f2a4a] px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    Proposal v{proposal.version}
                  </p>
                  <h2 className="text-white text-2xl font-bold leading-snug">{title}</h2>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-white ring-1 ring-white/20">
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-gray-50 rounded-xl p-4 text-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Prepared For</p>
                  <p className="font-semibold text-gray-700">{clientName}</p>
                  {proposal.lead?.address && <p className="text-gray-500 mt-1">{proposal.lead.address}</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Proposal Total</p>
                  <p className="text-2xl font-bold text-[#0f2a4a] tabular-nums">{fmt(total)}</p>
                </div>
              </div>

              {proposal.scope_text && (
                <section>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scope</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{proposal.scope_text}</p>
                </section>
              )}

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-gray-400" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Line Items</p>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {proposal.lines.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">No line items are available.</p>
                  ) : (
                    groupedLines(proposal.lines).map(([phase, lines]) => {
                      const phaseTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
                      return (
                        <div key={phase} className="border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{phase}</span>
                            <span className="text-sm font-semibold text-[#0f2a4a] tabular-nums">{fmt(phaseTotal)}</span>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {lines.map(line => (
                              <div key={line.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{line.description}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {Number(line.quantity).toLocaleString('en-US')} {line.uom}
                                  </p>
                                </div>
                                <p className="text-sm font-semibold text-gray-700 tabular-nums">{fmt(lineTotal(line))}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div className="flex items-center justify-between bg-[#0f2a4a] px-4 py-3 text-white">
                    <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
                    <span className="text-xl font-bold tabular-nums">{fmt(total)}</span>
                  </div>
                </div>
              </section>

              {proposal.notes && (
                <section>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{proposal.notes}</p>
                </section>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-6">
              {proposal.status === 'approved' || proposal.client_approved_at ? (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <CheckCircle className="text-green-500" size={40} />
                  <p className="font-semibold text-green-700 text-lg">Accepted</p>
                  {responseDate(proposal.client_approved_at) && (
                    <p className="text-sm text-gray-400">{responseDate(proposal.client_approved_at)}</p>
                  )}
                </div>
              ) : proposal.status === 'rejected' || proposal.client_rejected_at ? (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <XCircle className="text-red-400" size={40} />
                  <p className="font-semibold text-red-600 text-lg">Declined</p>
                  {responseDate(proposal.client_rejected_at) && (
                    <p className="text-sm text-gray-400">{responseDate(proposal.client_rejected_at)}</p>
                  )}
                </div>
              ) : proposal.status === 'draft' || proposal.status === 'voided' ? (
                <div className="flex flex-col items-center gap-3 py-2 text-gray-400 text-center">
                  <Clock size={36} />
                  <p className="text-sm">This proposal is not currently available for client response.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-center text-sm text-gray-500">
                    Please review the proposal above, then accept or decline.
                  </p>
                  <ProposalResponseForm token={token} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">Powered by JDC Platform</p>
      </footer>
    </div>
  )
}
