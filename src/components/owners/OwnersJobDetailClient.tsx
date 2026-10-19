'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, MapPin, ExternalLink } from 'lucide-react'
import type { CostClass, JobDetail, LiveShift } from '@/lib/owners/data'
import { C, CLASS_COLOR, money, moneyShort, pct, hoursFmt, marginTone, shortDate } from './theme'
import { CumulativeChart, MixBar, WeeklyBars, Legend } from './charts'
import { LiveCrewPanel, useLiveCrew } from './LiveCrewPanel'
import { OwnersShell, Kpi, ProgressBar } from './OwnersPortfolioClient'

const CLASS_ORDER: CostClass[] = ['labor', 'material', 'sub', 'other']
const CLASS_LABEL: Record<CostClass, string> = { labor: 'Labor', material: 'Material', sub: 'Subcontract', other: 'Other' }

function Panel({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border p-4 ${className}`} style={{ background: C.panel, borderColor: C.border }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.text }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Budget vs spent per trade (cost book division). Spent wears the Spent color everywhere. */
function TradeBars({ rows }: { rows: JobDetail['trades'] }) {
  const [hover, setHover] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  if (rows.length === 0) return <div className="text-sm" style={{ color: C.muted }}>No coded costs or budget lines yet.</div>
  const max = Math.max(...rows.map(r => Math.max(r.budget, r.spent)), 1)
  const shown = all ? rows : rows.slice(0, 12)
  return (
    <div>
      <div className="mb-3"><Legend items={[{ label: 'Spent', color: C.spent }, { label: 'Budget', color: C.budget }]} /></div>
      <ul className="space-y-2.5">
        {shown.map(r => {
          const over = r.budget > 0 && r.spent > r.budget
          const dim = hover && hover !== r.trade
          return (
            <li key={r.trade} onMouseEnter={() => setHover(r.trade)} onMouseLeave={() => setHover(null)}
              className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]" style={{ opacity: dim ? 0.5 : 1 }}>
              <span className="truncate text-xs" style={{ color: C.text2 }} title={r.trade}>{r.trade}</span>
              <div className="min-w-0">
                <div className="space-y-[2px]">
                  <div className="h-2.5 rounded-r" style={{ width: `${Math.max(0.5, (r.spent / max) * 100)}%`, background: C.spent }} />
                  {r.budget > 0 && <div className="h-1.5 rounded-r" style={{ width: `${(r.budget / max) * 100}%`, background: C.budget }} />}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums" style={{ color: C.text2 }}>
                  <span style={{ color: C.text }}>{hover === r.trade ? money(r.spent) : moneyShort(r.spent)}</span>
                  {r.budget > 0 && <span>of {hover === r.trade ? money(r.budget) : moneyShort(r.budget)}</span>}
                  {over && (
                    <span className="flex items-center gap-1" style={{ color: C.bad }}>
                      <AlertTriangle size={11} aria-label="over budget" /> {moneyShort(r.spent - r.budget)} over
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {rows.length > 12 && (
        <button onClick={() => setAll(v => !v)} className="mt-3 text-xs hover:underline" style={{ color: C.text2 }}>
          {all ? 'Show top 12' : `Show all ${rows.length} trades`}
        </button>
      )}
    </div>
  )
}

function Table({ head, rows, empty }: { head: { label: string; right?: boolean }[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <div className="text-sm" style={{ color: C.muted }}>{empty}</div>
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map(h => (
              <th key={h.label} className={`px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider ${h.right ? 'text-right' : 'text-left'}`} style={{ color: C.muted }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: C.grid }}>
              {r.map((c, j) => (
                <td key={j} className={`px-1 py-1.5 ${head[j]?.right ? 'text-right font-mono tabular-nums' : ''}`} style={{ color: j === 0 ? C.text : C.text2 }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OwnersJobDetailClient({ detail, initialCrew }: { detail: JobDetail; initialCrew: LiveShift[] }) {
  const { job, fin, mix, trades, crew, vendors, cumulative, weeklyHours, recent, invoices } = detail
  const live = useLiveCrew(initialCrew, job.id)
  const tone = marginTone(fin.marginPct)
  const mixParts = CLASS_ORDER.map(k => ({ key: k, label: CLASS_LABEL[k], color: CLASS_COLOR[k], value: mix[k] }))
  const hoursData = weeklyHours.map(w => ({ week: w.week, values: { hours: w.hours } }))
  const hours16 = weeklyHours.reduce((s, w) => s + w.hours, 0)

  return (
    <OwnersShell>
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="space-y-2">
          <Link href="/owners" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: C.text2 }}>
            <ArrowLeft size={13} /> Owners View
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold md:text-3xl" style={{ color: C.text }}>{job.name}</h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: C.muted }}>
                {job.jobNumber && <span>#{job.jobNumber}</span>}
                {job.clientName && <span>{job.clientName}</span>}
                {job.siteAddress && <span className="flex items-center gap-1"><MapPin size={11} />{job.siteAddress}</span>}
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: C.panel2, color: C.text2 }}>{job.status}</span>
              </p>
            </div>
            <Link href={`/jobs/${job.id}/budget`} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: C.border, color: C.text2, background: C.panel }}>
              Open budget <ExternalLink size={12} />
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Margin to date" value={pct(fin.marginPct)} tone={tone} sub="on billings" />
          <Kpi label="Profit to date" value={fin.profit == null ? '—' : moneyShort(fin.profit)} tone={fin.profit == null ? undefined : fin.profit >= 0 ? 'good' : 'bad'} />
          <Kpi label="Billed" value={moneyShort(fin.billed)} sub={fin.contract > 0 ? `of ${moneyShort(fin.contract)} contract` : 'no contract set'} />
          <Kpi label="Spent" value={moneyShort(fin.spent)} sub={fin.estimated > 0 ? `${Math.round((fin.spent / fin.estimated) * 100)}% of estimate` : undefined} />
          <Kpi label="Estimated cost" value={fin.estimated > 0 ? moneyShort(fin.estimated) : '—'} sub={fin.budgetIncomplete ? '⚠ looks incomplete' : fin.projectedMarginPct != null ? `${pct(fin.projectedMarginPct)} planned margin` : undefined} />
          <Kpi label="Collected" value={moneyShort(fin.collected)} sub={fin.openAR > 0 ? `${moneyShort(fin.openAR)} still owed` : 'nothing open'} />
          <Kpi label="Crew labor" value={moneyShort(fin.labor)} sub={fin.spent > 0 ? `${Math.round((fin.labor / fin.spent) * 100)}% of spend` : undefined} />
          <Kpi label="Hours logged" value={hoursFmt(fin.hours)} sub={fin.hours > 0 ? `${money(fin.labor / fin.hours)}/hr avg` : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Spent vs billed" className="lg:col-span-2"
            right={<Legend items={[{ label: 'Billed', color: C.billed }, { label: 'Spent', color: C.spent }, ...(fin.estimated > 0 ? [{ label: 'Estimate', color: C.budget }] : [])]} />}>
            <CumulativeChart points={cumulative} budget={fin.estimated} />
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="Progress">
              <ProgressBar value={fin.progressPct} basis={fin.progressBasis} />
              <p className="mt-2 text-[11px]" style={{ color: C.muted }}>
                {fin.progressBasis === 'schedule' ? 'Share of scheduled work whose dates have passed, weighted by duration.'
                  : fin.progressBasis === 'cost' ? 'Spent as a share of the estimate — no schedule on this job.'
                  : 'Add a schedule or a budget to track progress.'}
              </p>
            </Panel>
            <LiveCrewPanel shifts={live.shifts} now={live.now} syncedAt={live.syncedAt} linkJobs={false} title="On site now" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Spend by trade" right={<span className="text-[11px]" style={{ color: C.muted }}>QB cost codes + crew cost codes</span>}>
            <TradeBars rows={trades} />
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="Cost mix" right={<span className="font-mono text-xs" style={{ color: C.text2 }}>{money(fin.spent)}</span>}>
              <MixBar parts={mixParts} />
            </Panel>
            <Panel title="Crew hours · 16 weeks" right={<span className="font-mono text-xs" style={{ color: C.text2 }}>{hoursFmt(hours16)} hrs</span>}>
              <WeeklyBars weeks={hoursData} series={[{ key: 'hours', label: 'Hours', color: CLASS_COLOR.labor }]}
                height={180} format={n => `${Math.round(n)}h`} tipFormat={n => `${n.toFixed(1)} hrs`} />
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Crew on this job">
            <Table
              head={[{ label: 'Name' }, { label: 'Hours', right: true }, { label: 'Labor cost', right: true }, { label: 'Last on site', right: true }]}
              rows={crew.map(c => [c.name, hoursFmt(c.hours), money(c.cost), c.lastOn ? shortDate(c.lastOn) : '—'])}
              empty="No time clocked to this job yet." />
          </Panel>
          <Panel title="Top vendors">
            <Table
              head={[{ label: 'Vendor' }, { label: 'Lines', right: true }, { label: 'Spent', right: true }]}
              rows={vendors.map(v => [v.vendor, String(v.lines), money(v.amount)])}
              empty="No QuickBooks costs on this job yet." />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Recent costs" className="lg:col-span-2">
            <Table
              head={[{ label: 'Date' }, { label: 'Vendor' }, { label: 'Trade' }, { label: 'Type' }, { label: 'Amount', right: true }]}
              rows={recent.map(r => [
                shortDate(r.date),
                <span key="v" className="block max-w-[14rem] truncate" title={r.description}>{r.vendor}</span>,
                r.trade ?? '—',
                <span key="k" className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[r.kind] }} />{CLASS_LABEL[r.kind]}</span>,
                money(r.amount),
              ])}
              empty="No QuickBooks costs on this job yet." />
          </Panel>
          <Panel title="Invoices">
            <Table
              head={[{ label: 'Invoice' }, { label: 'Date', right: true }, { label: 'Amount', right: true }, { label: 'Open', right: true }]}
              rows={invoices.map(i => [i.doc ? `#${i.doc}` : '—', i.date ? shortDate(i.date) : '—', moneyShort(i.amount),
                <span key="b" style={{ color: i.balance > 0 ? C.warn : C.text2 }}>{i.balance > 0 ? moneyShort(i.balance) : 'Paid'}</span>])}
              empty="No invoices in QuickBooks yet." />
          </Panel>
        </div>
      </div>
    </OwnersShell>
  )
}
