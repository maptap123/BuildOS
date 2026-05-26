import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function PrintChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>
}) {
  const { id, coId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: co }, { data: job }] = await Promise.all([
    admin
      .from('change_orders')
      .select('*')
      .eq('id', coId)
      .eq('job_id', id)
      .single(),
    admin
      .from('jobs')
      .select('name, client_name, client_email, client_phone, site_address, city, state, postal_code, job_number, contract_amount')
      .eq('id', id)
      .single(),
  ])

  if (!co || !job) notFound()

  const typeLabel = co.type === 'additive' ? 'Addition to Contract' : co.type === 'deductive' ? 'Deduction from Contract' : 'Neutral (No Cost Change)'
  const amountPrefix = co.type === 'additive' ? '+' : co.type === 'deductive' ? '−' : ''
  const amountColor = co.type === 'additive' ? '#16a34a' : co.type === 'deductive' ? '#dc2626' : '#374151'

  const addressParts = [job.site_address, job.city, job.state, job.postal_code].filter(Boolean).join(', ')

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{co.co_number} — Change Order</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 14px;
            color: #111827;
            background: #fff;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header { border-bottom: 3px solid #0f2a4a; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company-name { font-size: 24px; font-weight: bold; color: #0f2a4a; letter-spacing: -0.5px; }
          .company-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .doc-title { font-size: 28px; font-weight: bold; color: #0f2a4a; text-align: right; text-transform: uppercase; letter-spacing: 2px; }
          .co-number { font-size: 14px; color: #9ca3af; text-align: right; margin-top: 4px; font-family: monospace; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .section-label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px; }
          .section-value { font-size: 14px; color: #111827; line-height: 1.6; }
          .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
          .amount-box { background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; text-align: center; margin: 28px 0; }
          .amount-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; margin-bottom: 8px; }
          .amount-value { font-size: 40px; font-weight: bold; letter-spacing: -1px; }
          .type-badge { display: inline-block; font-size: 13px; font-weight: bold; color: #374151; margin-top: 8px; }
          .description-box { background: #f9fafb; border-left: 4px solid #0f2a4a; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
          .sig-section { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .sig-line { border-top: 1px solid #111827; padding-top: 8px; font-size: 12px; color: #6b7280; }
          .sig-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 36px; }
          .print-btn { display: inline-flex; align-items: center; gap: 8px; background: #0f2a4a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 32px; }
          .print-btn:hover { background: #1e3a5f; }
          footer { margin-top: 60px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af; text-align: center; }
        `}</style>
      </head>
      <body>
        {/* Print button — hidden when printing */}
        <div className="no-print" style={{ marginBottom: '24px' }}>
          <button
            className="print-btn"
            onClick={undefined}
            suppressHydrationWarning
          >
            Print / Save as PDF
          </button>
          <script
            dangerouslySetInnerHTML={{
              __html: `document.querySelector('.print-btn').addEventListener('click', () => window.print())`,
            }}
          />
        </div>

        {/* Letterhead */}
        <div className="header">
          <div>
            <div className="company-name">JDC Construction</div>
            <div className="company-sub">{addressParts || 'General Contractor'}</div>
          </div>
          <div>
            <div className="doc-title">Change Order</div>
            <div className="co-number">{co.co_number}</div>
          </div>
        </div>

        {/* Job + Client info */}
        <div className="grid-2">
          <div>
            <div className="section-label">Project</div>
            <div className="section-value">
              <strong>{job.name}</strong>
              {job.site_address && <><br />{job.site_address}</>}
              {(job.city || job.state) && <><br />{[job.city, job.state, job.postal_code].filter(Boolean).join(', ')}</>}
            </div>
          </div>
          <div>
            <div className="section-label">Client</div>
            <div className="section-value">
              <strong>{job.client_name}</strong>
              {job.client_email && <><br />{job.client_email}</>}
              {job.client_phone && <><br />{job.client_phone}</>}
            </div>
          </div>
          <div>
            <div className="section-label">Date Submitted</div>
            <div className="section-value">{fmtDate(co.submitted_date)}</div>
          </div>
          <div>
            <div className="section-label">Status</div>
            <div className="section-value" style={{ textTransform: 'capitalize', fontWeight: '600' }}>{co.status}</div>
          </div>
        </div>

        <hr className="divider" />

        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <div className="section-label">Change Order Title</div>
          <div className="section-value" style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '4px' }}>{co.title}</div>
        </div>

        {/* Reason / Description */}
        {co.reason && (
          <div className="description-box">
            <div className="section-label" style={{ marginBottom: '8px' }}>Description of Work</div>
            <div className="section-value" style={{ lineHeight: '1.7' }}>{co.reason}</div>
          </div>
        )}

        {/* Amount */}
        <div className="amount-box">
          <div className="amount-label">Contract Adjustment</div>
          <div className="amount-value" style={{ color: amountColor }}>
            {amountPrefix}{fmt(co.amount)}
          </div>
          <div className="type-badge">{typeLabel}</div>
        </div>

        {/* Approved date if present */}
        {co.approved_date && (
          <div style={{ marginBottom: '12px' }}>
            <div className="section-label">Approved Date</div>
            <div className="section-value">{fmtDate(co.approved_date)}</div>
          </div>
        )}

        <hr className="divider" />

        {/* Signature lines */}
        <div className="sig-section">
          <div>
            <div className="sig-label">Client Signature</div>
            <div className="sig-line">Signature</div>
            <div style={{ marginTop: '24px' }}>
              <div className="sig-label">Print Name</div>
              <div className="sig-line">Name</div>
            </div>
          </div>
          <div>
            <div className="sig-label">Date</div>
            <div className="sig-line">Date</div>
            <div style={{ marginTop: '24px' }}>
              <div className="sig-label">Authorized By (JDC Construction)</div>
              <div className="sig-line">Signature</div>
            </div>
          </div>
        </div>

        <footer>
          This document is a change order to the original construction contract for {job.name}.
          {job.contract_amount != null && (
            <> Original contract amount: {fmt(job.contract_amount)}.</>
          )}
          <br />
          JDC Construction — BuildOS
        </footer>
      </body>
    </html>
  )
}
