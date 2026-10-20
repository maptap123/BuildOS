'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw, Search, TrendingUp, TrendingDown, Minus, AlertTriangle, HardHat, FileX, Unlink } from 'lucide-react'
import type { JobTile, LiveShift, Portfolio, CostClass } from '@/lib/owners/data'
import { C, CLASS_COLOR, money, moneyShort, pct, hoursFmt, marginTone, TONE_COLOR, type Tone } from './theme'
import { Sparkline, WeeklyBars, Legend, ContractBar } from './charts'
import { LiveCrewPanel, useLiveCrew } from './LiveCrewPanel'

const CLASS_ORDER: CostClass[] = ['labor', 'material', 'sub', 'other']
const CLASS_LABEL: Record<CostClass, string> = { labor: 'Labor', material: 'Material', sub: 'Subcontract', other: 'Other' }

type StatusFilter = 'active' | 'warranty' | 'presale' | 'all'
type SortKey = 'profit' | 'spent' | 'margin' | 'recent' | 'billed' | 'name'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'profit', label: 'Most profit' },
  { key: 'spent', label: 'Most spent' },
  { key: 'margin', label: 'Lowest margin' },
  { key: 'billed', label: 'Most billed' },
  { key: 'recent', label: 'Recent activity' },
  { key: 'name', label: 'Name' },
]

export function OwnersShell({ children }: { children: React.ReactNode }) {
  // Bleeds the terminal background to the edges of the dashboard content area.
  return (
    // Mirrors <main>'s padding in (dashboard)/layout.tsx: px-4 py-6 pb-28 / md:px-8 md:pb-8.
    <div className="-mx-4 -mt-6 -mb-28 min-h-screen px-4 pt-5 pb-28 md:-mx-8 md:-mb-8 md:px-8 md:pb-8" style={{ background: C.page, color: C.text }}>
      {children}
    </div>
  )
}

export function ToneIcon({ tone, size = 14 }: { tone: Tone; size?: number }) {
  const color = TONE_COLOR[tone]
  if (tone === 'good') return <TrendingUp size={size} color={color} aria-label="healthy" />
  if (tone === 'warn') return <Minus size={size} color={color} aria-label="thin" />
  if (tone === 'bad') return <TrendingDown size={size} color={color} aria-label="at risk" />
  return null
}

export function Kpi({ label, value, sub, tone, accent }: { label: string; value: string; sub?: string; tone?: Tone; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border px-3.5 py-3"
      style={{ background: C.panel, borderColor: C.border, ...(accent ? { borderTop: '2px solid #c09030' } : {}) }}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {tone && <ToneIcon tone={tone} size={16} />}
        <span className="truncate font-mono text-xl font-semibold tabular-nums" style={{ color: tone && tone !== 'none' ? TONE_COLOR[tone] : C.text }}>{value}</span>
      </div>
      {sub && <div className="mt-0.5 truncate text-xs" style={{ color: C.text2 }}>{sub}</div>}
    </div>
  )
}

export function ProgressBar({ value, basis }: { value: number | null; basis: JobTile['progressBasis'] }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: C.text2 }}>
        <span>Progress{basis ? <span style={{ color: C.muted }}> · by {basis}</span> : null}</span>
        <span className="font-mono tabular-nums" style={{ color: C.text }}>{value == null ? 'No schedule' : `${Math.round(value)}%`}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.panel2 }}>
        {value != null && (
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, #2a78d6, #3987e5)` }} />
        )}
      </div>
    </div>
  )
}

const needsSetup = (j: JobTile) => !j.setup.hasEstimate || !j.setup.qbLinked || j.budgetIncomplete

/** Amber alerts for what a job is missing. Icon + label, never color alone. */
export function SetupBadges({ setup, incomplete = false, size = 'sm' }: { setup: JobTile['setup']; incomplete?: boolean; size?: 'sm' | 'md' }) {
  const items = [
    !setup.hasEstimate && { key: 'est', icon: FileX, label: 'No estimate' },
    setup.hasEstimate && incomplete && { key: 'inc', icon: FileX, label: 'Estimate incomplete' },
    !setup.qbLinked && { key: 'qb', icon: Unlink, label: 'Not in QuickBooks' },
  ].filter(Boolean) as { key: string; icon: typeof FileX; label: string }[]
  if (items.length === 0) return null
  const cls = size === 'md' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-2 py-0.5 text-[10px] gap-1'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ key, icon: Icon, label }) => (
        <span key={key} className={`flex items-center rounded-full font-semibold ${cls}`}
          style={{ background: 'rgba(251,191,36,0.12)', color: C.warn, border: '1px solid rgba(251,191,36,0.35)' }}>
          <Icon size={size === 'md' ? 13 : 11} aria-hidden /> {label}
        </span>
      ))}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: C.panel2, color: C.text2 }}>
      {status}
    </span>
  )
}

function Tile({ job, onSite }: { job: JobTile; onSite: number }) {
  const tone = marginTone(job.priced ? job.projectedMarginPct : job.cashMarginPct)
  const thisWeek = job.weekly[job.weekly.length - 1] ?? 0
  const headline = job.priced ? job.projectedProfit : job.cashProfit
  return (
    <Link href={`/owners/${job.id}`}
      className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[#3a5280]"
      style={{ background: C.panel, borderColor: C.border }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ color: C.text }}>{job.name}</div>
          <div className="truncate text-xs" style={{ color: C.muted }}>
            {[job.jobNumber, job.clientName].filter(Boolean).join(' · ') || '—'}
          </div>
          <div className="mt-1.5"><SetupBadges setup={job.setup} incomplete={job.budgetIncomplete} /></div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusChip status={job.status} />
          {onSite > 0 && (
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#123524', color: C.good }}>
              <HardHat size={11} /> {onSite} on site
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            {job.priced ? 'Projected profit' : 'Billed − spent'}
          </div>
          <div className="flex items-center gap-1.5">
            <ToneIcon tone={tone} size={18} />
            <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: tone === 'none' ? C.text2 : TONE_COLOR[tone] }}>
              {headline == null ? '—' : moneyShort(headline)}
            </span>
          </div>
          <div className="truncate text-[11px]" style={{ color: C.text2 }}>
            {job.priced
              ? `${pct(job.projectedMarginPct, 0)} margin · ${pct(job.markupPct, 0)} markup`
              : job.cashMarginPct != null ? `${pct(job.cashMarginPct, 0)} on billings · no sell price` : 'No sell price yet'}
          </div>
        </div>
        <div className="w-1/2 min-w-0">
          <Sparkline values={job.weekly} />
          <div className="mt-0.5 text-right text-[10px]" style={{ color: C.muted }}>
            12-wk spend · this wk <span className="font-mono" style={{ color: C.text2 }}>{moneyShort(thisWeek)}</span>
          </div>
        </div>
      </div>

      {job.priced && <ContractBar contract={job.contract} estimated={job.estimated} spent={job.spent} />}

      <ProgressBar value={job.progressPct} basis={job.progressBasis} />

      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <Stat label="Sell price" value={job.contract > 0 ? moneyShort(job.contract) : '—'} />
        <Stat label="Cost budget" value={job.estimated > 0 ? moneyShort(job.estimated) : '—'}
          flag={job.budgetIncomplete ? 'Estimate looks incomplete — the job has gone well past it' : undefined} />
        <Stat label="Spent" value={moneyShort(job.spent)} />
        <Stat label="Billed" value={job.billed > 0 ? moneyShort(job.billed) : '—'} />
        <Stat label="Profit so far" value={job.earnedProfit == null ? '—' : moneyShort(job.earnedProfit)}
          color={job.earnedProfit == null ? undefined : job.earnedProfit >= 0 ? C.good : C.bad} />
        <Stat label="Left to bill" value={job.leftToBill == null ? '—' : moneyShort(job.leftToBill)} />
      </dl>
    </Link>
  )
}

function Stat({ label, value, color, flag }: { label: string; value: string; color?: string; flag?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1" style={{ color: C.muted }}>
        {label}
        {flag && <span title={flag}><AlertTriangle size={11} color={C.warn} aria-label={flag} /></span>}
      </dt>
      <dd className="font-mono text-sm tabular-nums" style={{ color: color ?? C.text }}>{value}</dd>
    </div>
  )
}

export function OwnersNoAccess() {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Owners View is limited to JDC&apos;s owners. Ask an admin to grant the &ldquo;Owners View&rdquo; permission.
    </div>
  )
}

export function OwnersPortfolioClient({ portfolio, initialCrew }: { portfolio: Portfolio; initialCrew: LiveShift[] }) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const { shifts, now, syncedAt } = useLiveCrew(initialCrew)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [sort, setSort] = useState<SortKey>('profit')
  const [q, setQ] = useState('')
  const [showQuiet, setShowQuiet] = useState(false)
  const [setupOnly, setSetupOnly] = useState(false)

  const onSiteByJob = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of shifts) if (s.jobId) m.set(s.jobId, (m.get(s.jobId) ?? 0) + 1)
    return m
  }, [shifts])

  const inStatus = useMemo(
    () => portfolio.jobs.filter(j => status === 'all' || j.status === status),
    [portfolio.jobs, status],
  )

  // A priced job that hasn't started still has profit coming — it isn't quiet.
  const isQuiet = (j: JobTile) => !j.priced && j.spent === 0 && j.billed === 0 && !onSiteByJob.has(j.id)
  const headlineProfit = (j: JobTile) => (j.priced ? j.projectedProfit : j.cashProfit) ?? -Infinity
  const headlineMargin = (j: JobTile) => (j.priced ? j.projectedMarginPct : j.cashMarginPct) ?? Infinity

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = inStatus.filter(j =>
      (setupOnly ? needsSetup(j) : (showQuiet || !isQuiet(j))) &&
      (!needle || `${j.name} ${j.jobNumber} ${j.clientName ?? ''}`.toLowerCase().includes(needle)))
    const by: Record<SortKey, (a: JobTile, b: JobTile) => number> = {
      profit: (a, b) => headlineProfit(b) - headlineProfit(a),
      spent: (a, b) => b.spent - a.spent,
      billed: (a, b) => b.billed - a.billed,
      margin: (a, b) => headlineMargin(a) - headlineMargin(b),
      recent: (a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    // Jobs with crew on site right now float to the top of every sort.
    return [...list].sort((a, b) => ((onSiteByJob.get(b.id) ?? 0) > 0 ? 1 : 0) - ((onSiteByJob.get(a.id) ?? 0) > 0 ? 1 : 0) || by[sort](a, b))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStatus, q, sort, showQuiet, setupOnly, onSiteByJob])

  const quietCount = inStatus.filter(isQuiet).length
  const setupCount = inStatus.filter(needsSetup).length
  const noEstimate = inStatus.filter(j => !j.setup.hasEstimate).length
  const noQB = inStatus.filter(j => !j.setup.qbLinked).length
  const incompleteEst = inStatus.filter(j => j.setup.hasEstimate && j.budgetIncomplete).length

  const totals = useMemo(() => {
    const t = { spent: 0, billed: 0, collected: 0, openAR: 0, priced: 0, contract: 0, planned: 0, earned: 0, projected: 0, leftToBill: 0, cashUnpriced: 0 }
    for (const j of inStatus) {
      t.spent += j.spent; t.billed += j.billed; t.collected += j.collected; t.openAR += j.openAR
      if (j.priced) {
        t.priced += 1
        t.contract += j.contract
        t.planned += j.plannedProfit ?? 0
        t.earned += j.earnedProfit ?? 0
        t.projected += j.projectedProfit ?? 0
        t.leftToBill += Math.max(0, j.leftToBill ?? 0)
      } else if (j.cashProfit != null) {
        // no sell price → the only profit we can see is what's been billed over what's been spent
        t.cashUnpriced += j.cashProfit
      }
    }
    const cost = t.contract - t.planned
    return {
      ...t,
      plannedMargin: t.contract > 0 ? (t.planned / t.contract) * 100 : null,
      markup: cost > 0 ? (t.planned / cost) * 100 : null,
      projectedMargin: t.contract > 0 ? (t.projected / t.contract) * 100 : null,
      profitSoFar: t.earned + t.cashUnpriced,
      stillToEarn: t.projected - t.earned,
    }
  }, [inStatus])

  const weekSeries = CLASS_ORDER.map(k => ({ key: k, label: CLASS_LABEL[k], color: CLASS_COLOR[k] }))
  const weekData = portfolio.weeks.map(w => ({ week: w.week, values: { labor: w.labor, material: w.material, sub: w.sub, other: w.other } }))
  const burn26 = portfolio.weeks.reduce((s, w) => s + w.labor + w.material + w.sub + w.other, 0)
  const generated = new Date(portfolio.generatedAt)

  return (
    <OwnersShell>
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: '#c09030' }}>JDC Remodeling</div>
            <h1 className="font-display text-2xl font-semibold md:text-3xl" style={{ color: C.text }}>Owners View</h1>
            <p className="text-xs" style={{ color: C.muted }}>
              Costs from QuickBooks + time clock · billing from QuickBooks · as of{' '}
              {generated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={() => startRefresh(() => router.refresh())}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: C.border, color: C.text2, background: C.panel }}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </header>

        {/* Profit — the headline */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#c09030' }}>Profit</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi accent label="Sold" value={moneyShort(totals.contract)}
              sub={`${totals.priced} of ${inStatus.length} jobs have a sell price`} />
            <Kpi accent label="Planned profit" value={moneyShort(totals.planned)} tone={marginTone(totals.plannedMargin)}
              sub={`${pct(totals.plannedMargin, 0)} margin · ${pct(totals.markup, 0)} markup`} />
            <Kpi accent label="Profit so far" value={moneyShort(totals.profitSoFar)} tone={totals.profitSoFar >= 0 ? 'good' : 'bad'}
              sub={`${moneyShort(totals.earned)} earned + ${moneyShort(totals.cashUnpriced)} cash`} />
            <Kpi accent label="Still to earn" value={moneyShort(totals.stillToEarn)}
              sub={`projected ${moneyShort(totals.projected)} total · ${pct(totals.projectedMargin, 0)}`} />
            <Kpi accent label="Left to bill" value={moneyShort(totals.leftToBill)} sub="on priced jobs" />
          </div>
        </section>

        {/* Cash */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.muted }}>Cash &amp; crew</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Billed" value={moneyShort(totals.billed)} sub={`${inStatus.length} ${status === 'all' ? '' : status} jobs`} />
            <Kpi label="Spent" value={moneyShort(totals.spent)} />
            <Kpi label="Collected" value={moneyShort(totals.collected)} />
            <Kpi label="Owed to us" value={moneyShort(totals.openAR)} sub="open invoices" />
            <Kpi label="Labor this wk" value={moneyShort(portfolio.laborThisWeek)} sub={`${hoursFmt(portfolio.hoursThisWeek)} hrs`} />
            <Kpi label="Crew on clock" value={String(shifts.length)} sub={shifts.length ? `${onSiteByJob.size} job${onSiteByJob.size === 1 ? '' : 's'}` : 'none right now'} />
          </div>
        </section>

        {/* Live crew + company burn */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <LiveCrewPanel shifts={shifts} now={now} syncedAt={syncedAt} />
          </div>
          <section className="rounded-xl border p-4 lg:col-span-2" style={{ background: C.panel, borderColor: C.border }}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.text }}>Company spend · 26 weeks</h2>
              <span className="font-mono text-xs" style={{ color: C.text2 }}>{money(burn26)}</span>
            </div>
            <WeeklyBars weeks={weekData} series={weekSeries} height={240} />
            <div className="mt-2"><Legend items={weekSeries} /></div>
          </section>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5" style={{ borderColor: C.border, background: C.panel }}>
            {(['active', 'warranty', 'presale', 'all'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className="rounded-md px-3 py-1 text-xs font-medium capitalize"
                style={status === s ? { background: '#1d3a63', color: C.text } : { color: C.text2 }}>
                {s} <span className="font-mono" style={{ color: C.muted }}>{s === 'all' ? portfolio.jobs.length : portfolio.jobs.filter(j => j.status === s).length}</span>
              </button>
            ))}
          </div>
          <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 sm:max-w-xs" style={{ borderColor: C.border, background: C.panel }}>
            <Search size={14} color={C.muted} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#6f83a3]" style={{ color: C.text }} />
          </label>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: C.border, background: C.panel, color: C.text }}>
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {setupCount > 0 && (
            <button onClick={() => setSetupOnly(v => !v)}
              title={`${noEstimate} without an estimate · ${incompleteEst} with an incomplete estimate · ${noQB} not linked to QuickBooks`}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
              style={setupOnly
                ? { background: 'rgba(251,191,36,0.18)', borderColor: C.warn, color: C.warn }
                : { background: C.panel, borderColor: 'rgba(251,191,36,0.45)', color: C.warn }}>
              <AlertTriangle size={13} aria-hidden /> Needs setup <span className="font-mono">{setupCount}</span>
            </button>
          )}
          {quietCount > 0 && !setupOnly && (
            <button onClick={() => setShowQuiet(v => !v)} className="text-xs underline-offset-2 hover:underline" style={{ color: C.text2 }}>
              {showQuiet ? 'Hide' : 'Show'} {quietCount} job{quietCount === 1 ? '' : 's'} with no costs or billing
            </button>
          )}
        </div>

        {/* Job tiles */}
        {visible.length === 0 ? (
          <div className="rounded-xl border px-4 py-10 text-center text-sm" style={{ borderColor: C.border, color: C.muted, background: C.panel }}>
            No jobs match.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map(j => <Tile key={j.id} job={j} onSite={onSiteByJob.get(j.id) ?? 0} />)}
          </div>
        )}
      </div>
    </OwnersShell>
  )
}
