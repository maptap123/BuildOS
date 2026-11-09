import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { loadSelectionsBoard } from '@/lib/selections/board'
import ProposalPrintControls from '@/components/estimates/ProposalPrintControls'
import type { Selection } from '@/types'

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const NO_LOCATION = 'General'

const CSS = `
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; padding: 0; max-width: none; }
    .room { break-inside: avoid-page; }
    .sel { break-inside: avoid; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  .print-root { max-width: 900px; margin: 0 auto; padding: 32px; color: #111827; background: #fff;
    font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
    margin-bottom: 28px; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; }
  .toolbar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .print-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border-radius: 7px;
    border: 0; padding: 0 14px; font-size: 13px; font-weight: 700; cursor: pointer; background: #0f2a4a; color: #fff; }
  .view-link { display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px; border-radius: 7px;
    border: 1px solid #d1d5db; font-size: 13px; font-weight: 700; text-decoration: none; color: #374151; background: #fff; }
  .view-link.on { background: #0f2a4a; color: #fff; border-color: #0f2a4a; }
  .muted { color: #6b7280; }
  .letterhead { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 28px; border-bottom: 3px solid #0f2a4a;
    padding-bottom: 22px; margin-bottom: 26px; }
  .company-name { color: #0f2a4a; font-family: Georgia, serif; font-size: 28px; font-weight: 700; }
  .company-sub { margin-top: 4px; color: #6b7280; font-size: 12px; }
  .doc-meta { text-align: right; }
  .doc-title { color: #0f2a4a; font-size: 28px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
  .job-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 22px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .label { color: #6b7280; font-size: 10px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; text-transform: uppercase; }
  .room { margin-top: 22px; }
  .room-title { background: #0f2a4a; color: #fff; padding: 8px 12px; border-radius: 6px 6px 0 0;
    font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; }
  .sel { border: 1px solid #d1d5db; border-top: 0; padding: 12px 14px; }
  .sel:last-child { border-radius: 0 0 6px 6px; }
  .sel-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .sel-title { color: #0f2a4a; font-size: 14px; font-weight: 800; }
  .sel-code { color: #6b7280; font-size: 11px; }
  .item { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0 8px 12px; margin-top: 8px;
    border-left: 3px solid #b68a35; background: #f9fafb; padding-right: 12px; }
  .item-title { font-weight: 700; color: #111827; }
  .item-sub { color: #4b5563; font-size: 12px; margin-top: 2px; white-space: pre-line; }
  .item-price { font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .allow { margin-top: 8px; font-size: 11px; color: #6b7280; text-align: right; }
  .pending-box { margin-top: 26px; border: 1px dashed #9ca3af; border-radius: 8px; padding: 12px 14px; }
  .pending-box li { margin: 4px 0 0 18px; }
  .totals { width: 320px; margin: 22px 0 0 auto; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; gap: 18px; padding: 9px 13px; border-top: 1px solid #e5e7eb; }
  .totals-row:first-child { border-top: 0; }
  .totals-row.grand { background: #0f2a4a; color: #fff; font-weight: 800; }
  footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 10px; text-align: center; }
  @media screen and (max-width: 760px) {
    .print-root { padding: 18px; } .letterhead, .job-card { grid-template-columns: 1fr; } .doc-meta { text-align: left; }
    .totals { width: 100%; }
  }
`

/**
 * A printable selections sheet for a job. Two views from the same data:
 *  - client: chosen items with prices and the allowance roll-up
 *  - trade:  chosen items with vendor + product details and no money, for subs/suppliers
 * Only picked items print; selections nobody has picked yet are listed as "still to be selected".
 */
export default async function PrintSelectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { id } = await params
  const { view } = await searchParams
  const trade = view === 'trade'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  if (!(await hasModulePermOrAdmin(admin, user.id, 'budget', 'can_view'))) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ padding: 40, color: '#991b1b', fontFamily: 'Arial, sans-serif' }}>
          You do not have permission to view selections.
        </div>
      </>
    )
  }

  const { data: job } = await admin
    .from('jobs')
    .select('id, job_number, name, client_name, site_address, city, state, postal_code')
    .eq('id', id)
    .single()
  if (!job) notFound()

  const board = await loadSelectionsBoard(admin, id, user.id)
  const picks = (s: Selection) => s.choices.filter(c => c.is_selected)
  const done = board.selections.filter(s => picks(s).length > 0)
  const pending = board.selections.filter(s => picks(s).length === 0)

  const rooms = new Map<string, Selection[]>()
  for (const s of done) {
    const key = s.location?.trim() || NO_LOCATION
    rooms.set(key, [...(rooms.get(key) ?? []), s])
  }
  const roomList = [...rooms.entries()].sort(([a], [b]) =>
    a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b))

  const allowanceById = new Map(board.allowances.map(a => [a.id, a]))
  const total = done.reduce((sum, s) => sum + picks(s).reduce((t, c) => t + Number(c.client_price), 0), 0)
  const address = [job.site_address, [job.city, job.state].filter(Boolean).join(', '), job.postal_code].filter(Boolean).join(' ')
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="print-root">
        <div className="toolbar no-print">
          <div className="toolbar-actions">
            <a className={`view-link ${!trade ? 'on' : ''}`} href="?view=client">Client copy (with prices)</a>
            <a className={`view-link ${trade ? 'on' : ''}`} href="?view=trade">Trade copy (no prices)</a>
          </div>
          <div className="toolbar-actions">
            <ProposalPrintControls internal={false} />
          </div>
        </div>

        <header className="letterhead">
          <div>
            <div className="company-name">JDC Construction</div>
            <div className="company-sub">General Contractor</div>
          </div>
          <div className="doc-meta">
            <div className="doc-title">Selections</div>
            <div className="muted" style={{ marginTop: 6 }}>{today}</div>
          </div>
        </header>

        <div className="job-card">
          <div>
            <div className="label">Project</div>
            <strong>{job.name}</strong>
            <div className="muted">Job #{job.job_number}</div>
          </div>
          <div>
            <div className="label">{trade ? 'Site address' : 'Client'}</div>
            <strong>{trade ? address : job.client_name}</strong>
            {!trade && <div className="muted">{address}</div>}
          </div>
        </div>

        {roomList.length === 0 && <p className="muted">No items have been selected yet.</p>}

        {roomList.map(([room, sels]) => (
          <section className="room" key={room}>
            <div className="room-title">{room}</div>
            {sels.map(s => {
              const a = s.allowance_id ? allowanceById.get(s.allowance_id) : undefined
              return (
                <div className="sel" key={s.id}>
                  <div className="sel-head">
                    <span className="sel-title">{s.title}</span>
                    {s.cost_code && <span className="sel-code">{s.cost_code.replace(/\.+$/, '')}</span>}
                  </div>
                  {picks(s).map(c => (
                    <div className="item" key={c.id}>
                      <div>
                        <div className="item-title">{c.title}</div>
                        {(c.vendor?.name || c.details) && (
                          <div className="item-sub">
                            {[c.vendor?.name, c.details].filter(Boolean).join('\n')}
                          </div>
                        )}
                        {c.product_url && <div className="item-sub" style={{ wordBreak: 'break-all' }}>{c.product_url}</div>}
                      </div>
                      {!trade && <div className="item-price">{fmtMoney(Number(c.client_price))}</div>}
                    </div>
                  ))}
                  {!trade && a && (
                    <div className="allow">
                      {a.title}: allowance {fmtMoney(a.amount)}
                      {a.remaining < 0 ? ` · over by ${fmtMoney(-a.remaining)}` : ` · ${fmtMoney(a.remaining)} remaining`}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}

        {!trade && roomList.length > 0 && (
          <div className="totals">
            <div className="totals-row grand"><span>Total selected</span><span>{fmtMoney(total)}</span></div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="pending-box">
            <div className="label">Still to be selected</div>
            <ul>
              {pending.map(s => (
                <li key={s.id}>
                  {s.title}{s.location ? ` — ${s.location}` : ''}
                  {s.deadline ? ` (needed by ${new Date(s.deadline + 'T12:00:00').toLocaleDateString()})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer>JDC Construction · Selections as of {today}. Subject to availability and final confirmation.</footer>
      </div>
    </>
  )
}
