import { notFound, redirect } from 'next/navigation'
import { Fragment } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Estimate, EstimateLine, Lead } from '@/types'

type ProposalLineGroup = {
  phase: string
  lines: EstimateLine[]
  subtotal: number
  markup: number
  total: number
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const fmtQty = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const lineSubtotal = (line: EstimateLine) => Number(line.quantity) * Number(line.unit_cost)
const lineMarkup = (line: EstimateLine) => lineSubtotal(line) * (Number(line.markup_pct) / 100)
const lineTotal = (line: EstimateLine) => lineSubtotal(line) + lineMarkup(line)

function groupLines(lines: EstimateLine[]): ProposalLineGroup[] {
  const groups = new Map<string, EstimateLine[]>()
  for (const line of lines) {
    const phase = line.phase?.trim() || 'General Conditions'
    groups.set(phase, [...(groups.get(phase) ?? []), line])
  }
  return Array.from(groups.entries()).map(([phase, groupLines]) => {
    const subtotal = groupLines.reduce((sum, line) => sum + lineSubtotal(line), 0)
    const markup = groupLines.reduce((sum, line) => sum + lineMarkup(line), 0)
    return { phase, lines: groupLines, subtotal, markup, total: subtotal + markup }
  })
}

const CSS = `
  @page { size: letter; margin: 0.55in; }
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; padding: 0; max-width: none; }
    .page-break { break-before: page; }
    table { break-inside: auto; }
    tr { break-inside: avoid; break-after: auto; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ffffff; }
  .print-root {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px;
    color: #111827;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 1.45;
  }
  .toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    margin-bottom: 28px; padding: 12px 14px;
    border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb;
  }
  .toolbar-actions { display: flex; align-items: center; gap: 10px; }
  .print-btn, .accept-link {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 38px; border-radius: 7px; border: 0; padding: 0 14px;
    font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer;
  }
  .print-btn { background: #0f2a4a; color: white; }
  .accept-link { background: #b68a35; color: white; }
  .muted { color: #6b7280; }
  .letterhead {
    display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 28px;
    border-bottom: 3px solid #0f2a4a; padding-bottom: 22px; margin-bottom: 26px;
  }
  .company-name { color: #0f2a4a; font-family: Georgia, serif; font-size: 28px; font-weight: 700; }
  .company-sub { margin-top: 4px; color: #6b7280; font-size: 12px; }
  .doc-meta { text-align: right; }
  .doc-title { color: #0f2a4a; font-size: 30px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
  .status-badge {
    display: inline-block; margin-top: 8px; padding: 4px 9px;
    border: 1px solid #d1d5db; border-radius: 999px;
    color: #374151; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
  }
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 24px; }
  .info-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 15px; min-height: 118px; }
  .label { color: #6b7280; font-size: 10px; font-weight: 800; letter-spacing: 1px; margin-bottom: 7px; text-transform: uppercase; }
  .value { color: #111827; }
  .value strong { color: #0f2a4a; font-size: 15px; }
  .summary-bar {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; overflow: hidden;
    border: 1px solid #d1d5db; border-radius: 8px; margin: 24px 0; background: #d1d5db;
  }
  .summary-cell { background: #f9fafb; padding: 14px 16px; }
  .summary-cell.total { background: #0f2a4a; color: #ffffff; }
  .summary-cell.total .label { color: #cbd5e1; }
  .summary-amount { font-size: 20px; font-weight: 800; color: #0f2a4a; }
  .summary-cell.total .summary-amount { color: #ffffff; }
  .section { margin-top: 24px; }
  .section-title { color: #0f2a4a; font-size: 15px; font-weight: 800; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.8px; }
  .scope-box { border-left: 4px solid #b68a35; background: #f9fafb; border-radius: 0 8px 8px 0; padding: 14px 16px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; }
  th { background: #0f2a4a; color: #ffffff; padding: 9px 8px; text-align: left; font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; }
  td { padding: 9px 8px; border-top: 1px solid #e5e7eb; vertical-align: top; }
  .phase-row td { background: #eef2f7; color: #0f2a4a; font-size: 11px; font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase; }
  .notes { display: block; margin-top: 3px; color: #6b7280; font-size: 11px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { width: 330px; margin: 18px 0 0 auto; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; gap: 18px; padding: 10px 13px; border-top: 1px solid #e5e7eb; }
  .totals-row:first-child { border-top: 0; }
  .totals-row.grand { background: #0f2a4a; color: #ffffff; font-size: 17px; font-weight: 800; }
  .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; }
  .terms-box { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px 15px; }
  .terms-box ul { margin-left: 18px; }
  .terms-box li { margin-top: 6px; }
  .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 38px; margin-top: 42px; }
  .sig-line { border-top: 1px solid #111827; padding-top: 7px; color: #6b7280; font-size: 11px; }
  footer { margin-top: 42px; padding-top: 14px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 10px; text-align: center; }
  @media screen and (max-width: 760px) {
    .print-root { padding: 18px; }
    .letterhead, .info-grid, .terms-grid, .signature-grid { grid-template-columns: 1fr; }
    .doc-meta { text-align: left; }
    .summary-bar { grid-template-columns: 1fr; }
    .totals { width: 100%; }
  }
`

export default async function PrintProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; estimateId: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { id, estimateId } = await params
  const { view } = await searchParams
  const isInternalView = view === 'internal'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: perm }, { data: lead }, { data: estimate }, { data: lines }] = await Promise.all([
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'budget').single(),
    admin.from('leads').select('*').eq('id', id).single(),
    admin.from('estimates').select('*').eq('id', estimateId).eq('lead_id', id).single(),
    admin.from('estimate_lines').select('*').eq('estimate_id', estimateId).eq('lead_id', id)
      .order('sort_order').order('created_at'),
  ])

  if (!perm?.can_view) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ padding: '40px', color: '#991b1b', fontFamily: 'Arial, sans-serif' }}>
          You do not have permission to view proposals.
        </div>
      </>
    )
  }

  if (!lead || !estimate) notFound()

  const typedLead = lead as Lead
  const typedEstimate = estimate as Estimate
  const allLines = (lines ?? []) as EstimateLine[]

  const visibleLines = isInternalView ? allLines : allLines.filter(l => l.client_visible !== false)
  const showLineDetails = isInternalView || (typedEstimate.show_line_details !== false)
  const showCostBreakdown = isInternalView || (typedEstimate.show_cost_breakdown === true)

  const groups = groupLines(visibleLines)
  const subtotal = visibleLines.reduce((sum, line) => sum + lineSubtotal(line), 0)
  const markup = visibleLines.reduce((sum, line) => sum + lineMarkup(line), 0)
  const total = subtotal + markup
  const proposalTitle = typedEstimate.title || typedEstimate.job_name || typedLead.title || `Estimate v${typedEstimate.version}`
  const statusLabel = typedEstimate.status === 'approved' ? 'Accepted' : typedEstimate.status
  const publicProposalHref = typedEstimate.public_token ? `/proposals/${typedEstimate.public_token}` : null
  const clientResponseDate = typedEstimate.client_approved_at || typedEstimate.client_rejected_at

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="print-root">
        <div className="toolbar no-print">
          <div>
            <strong>{isInternalView ? 'Internal view' : 'Client view'}</strong>
            <div className="muted">
              {isInternalView ? 'Showing all lines including internal-only items.' : 'Use print to save this proposal as a PDF.'}
            </div>
          </div>
          <div className="toolbar-actions">
            <a
              href={`?view=${isInternalView ? 'client' : 'internal'}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: '38px', borderRadius: '7px', padding: '0 14px',
                fontSize: '13px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
                background: isInternalView ? '#d1fae5' : '#fef3c7',
                color: isInternalView ? '#065f46' : '#92400e',
                border: isInternalView ? '1px solid #6ee7b7' : '1px solid #fcd34d',
              }}
            >
              {isInternalView ? 'Switch to Client View' : 'Switch to Internal View'}
            </a>
            {publicProposalHref && (
              <a className="accept-link" href={publicProposalHref}>
                {typedEstimate.status === 'approved' ? 'View accepted proposal' : 'Accept online'}
              </a>
            )}
            <button className="print-btn" onClick={undefined} suppressHydrationWarning>
              Print / Save as PDF
            </button>
          </div>
          <script dangerouslySetInnerHTML={{ __html: `document.querySelector('.print-btn').addEventListener('click',()=>window.print())` }} />
        </div>

        {isInternalView && (
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '0.8px' }} className="no-print">
            INTERNAL VIEW — All lines shown including hidden items. Not for client distribution.
          </div>
        )}

        {typedEstimate.proposal_header_text && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', whiteSpace: 'pre-wrap', color: '#0c4a6e' }}>
            {typedEstimate.proposal_header_text}
          </div>
        )}

        <header className="letterhead">
          <div>
            <div className="company-name">JDC Construction</div>
            <div className="company-sub">General Contractor</div>
          </div>
          <div className="doc-meta">
            <div className="doc-title">Proposal</div>
            <div className="muted">Estimate v{typedEstimate.version}</div>
            <span className="status-badge">{statusLabel}</span>
          </div>
        </header>

        <section className="info-grid">
          <div className="info-card">
            <div className="label">Prepared For</div>
            <div className="value">
              <strong>{typedLead.client_name || 'Client'}</strong>
              {typedLead.client_email && <><br />{typedLead.client_email}</>}
              {typedLead.client_phone && <><br />{typedLead.client_phone}</>}
            </div>
          </div>
          <div className="info-card">
            <div className="label">Project</div>
            <div className="value">
              <strong>{proposalTitle}</strong>
              {typedLead.address && <><br />{typedLead.address}</>}
              {typedEstimate.job_type && <><br /><span className="muted">{typedEstimate.job_type}</span></>}
            </div>
          </div>
          <div className="info-card">
            <div className="label">Proposal Details</div>
            <div className="value">
              <strong>{fmtDate(typedEstimate.updated_at || typedEstimate.created_at)}</strong>
              <br />Created {fmtDate(typedEstimate.created_at)}
              <br />{visibleLines.length} line item{visibleLines.length === 1 ? '' : 's'}
              {isInternalView && allLines.length !== visibleLines.length && (
                <> ({allLines.length} total incl. internal)</>
              )}
            </div>
          </div>
        </section>

        <section className="summary-bar">
          <div className="summary-cell">
            <div className="label">Subtotal</div>
            <div className="summary-amount">{fmtMoney(subtotal)}</div>
          </div>
          <div className="summary-cell">
            <div className="label">Markup</div>
            <div className="summary-amount">{fmtMoney(markup)}</div>
          </div>
          <div className="summary-cell total">
            <div className="label">Proposal Total</div>
            <div className="summary-amount">{fmtMoney(total)}</div>
          </div>
        </section>

        {(typedEstimate.scope_text || typedEstimate.notes) && (
          <section className="section">
            <h2 className="section-title">Scope Summary</h2>
            <div className="scope-box">{typedEstimate.scope_text || typedEstimate.notes}</div>
          </section>
        )}

        {showLineDetails && (
          <section className="section">
            <h2 className="section-title">Proposal Detail</h2>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  {showCostBreakdown && <th style={{ width: '76px' }}>Code</th>}
                  {showCostBreakdown && <th className="num" style={{ width: '64px' }}>Qty</th>}
                  {showCostBreakdown && <th style={{ width: '58px' }}>Unit</th>}
                  {showCostBreakdown && <th className="num" style={{ width: '96px' }}>Unit Cost</th>}
                  {showCostBreakdown && <th className="num" style={{ width: '74px' }}>Markup</th>}
                  <th className="num" style={{ width: '106px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={showCostBreakdown ? 7 : 2} className="muted">No proposal line items have been added.</td></tr>
                ) : (
                  groups.map(group => (
                    <Fragment key={group.phase}>
                      <tr className="phase-row">
                        <td colSpan={showCostBreakdown ? 6 : 1}>{group.phase}</td>
                        <td className="num">{fmtMoney(group.total)}</td>
                      </tr>
                      {group.lines.map(line => {
                        const isLineHidden = line.client_visible === false
                        return (
                          <tr key={line.id} style={isLineHidden ? { background: '#fef9c3' } : {}}>
                            <td>
                              <span>{line.description}</span>
                              {isLineHidden && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, background: '#fde047', color: '#713f12', padding: '1px 6px', borderRadius: '4px' }}>
                                  INTERNAL
                                </span>
                              )}
                              {line.notes && <span className="notes">{line.notes}</span>}
                              {isInternalView && line.internal_note && (
                                <span className="notes" style={{ color: '#d97706', fontStyle: 'italic' }}>
                                  Internal note: {line.internal_note}
                                </span>
                              )}
                            </td>
                            {showCostBreakdown && <td>{line.cost_code || '-'}</td>}
                            {showCostBreakdown && <td className="num">{fmtQty(Number(line.quantity))}</td>}
                            {showCostBreakdown && <td>{line.uom}</td>}
                            {showCostBreakdown && <td className="num">{fmtMoney(Number(line.unit_cost))}</td>}
                            {showCostBreakdown && <td className="num">{Number(line.markup_pct)}%</td>}
                            <td className="num">{fmtMoney(lineTotal(line))}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
            <div className="totals">
              <div className="totals-row"><span>Subtotal</span><strong>{fmtMoney(subtotal)}</strong></div>
              <div className="totals-row"><span>Markup</span><strong>{fmtMoney(markup)}</strong></div>
              <div className="totals-row grand"><span>Total</span><span>{fmtMoney(total)}</span></div>
            </div>
          </section>
        )}

        {!showLineDetails && (
          <section className="section">
            <div className="summary-bar">
              <div className="summary-cell"><div className="label">Subtotal</div><div className="summary-amount">{fmtMoney(subtotal)}</div></div>
              <div className="summary-cell"><div className="label">Markup</div><div className="summary-amount">{fmtMoney(markup)}</div></div>
              <div className="summary-cell total"><div className="label">Proposal Total</div><div className="summary-amount">{fmtMoney(total)}</div></div>
            </div>
          </section>
        )}

        {typedEstimate.proposal_footer_text && (
          <section className="section">
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px 16px', fontSize: '13px', whiteSpace: 'pre-wrap', color: '#374151' }}>
              {typedEstimate.proposal_footer_text}
            </div>
          </section>
        )}

        <section className="section page-break">
          <h2 className="section-title">Terms and Acceptance</h2>
          <div className="terms-grid">
            <div className="terms-box">
              <div className="label">Proposal Terms</div>
              <ul>
                <li>Proposal pricing is based on the scope and line items shown in this document.</li>
                <li>Changes outside this scope may require a written change order.</li>
                <li>Permits, allowances, taxes, and owner selections are included only where specifically listed.</li>
                <li>Schedule and start date are subject to final approval, material availability, and contract execution.</li>
              </ul>
            </div>
            <div className="terms-box">
              <div className="label">Acceptance</div>
              {clientResponseDate ? (
                <p>
                  Client response recorded on {fmtDate(clientResponseDate)}
                  {typedEstimate.client_name ? ` by ${typedEstimate.client_name}` : ''}.
                  {typedEstimate.client_signature ? ` Signature: ${typedEstimate.client_signature}.` : ''}
                  {typedEstimate.client_response_note ? ` Note: ${typedEstimate.client_response_note}` : ''}
                </p>
              ) : (
                <p>
                  By signing below, the client authorizes JDC Construction to proceed with preparing the work
                  described in this proposal. Online acceptance can be completed through the public proposal
                  review link when available.
                </p>
              )}
            </div>
          </div>
          <div className="signature-grid">
            <div>
              <div className="sig-line">Client Signature</div>
              <div style={{ height: '34px' }} />
              <div className="sig-line">Printed Name</div>
            </div>
            <div>
              <div className="sig-line">Date</div>
              <div style={{ height: '34px' }} />
              <div className="sig-line">JDC Construction Representative</div>
            </div>
          </div>
        </section>

        <footer>
          JDC Construction - Proposal for {typedLead.title}. This printable page is intended for client review,
          signature, and browser Save as PDF workflows.
        </footer>
      </div>
    </>
  )
}
