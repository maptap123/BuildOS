/**
 * Owners View data
 * ================
 * Everything the owners' command center shows is computed here, server-side, from four
 * sources that each own one fact:
 *
 *   - costs      ← `actuals` (QuickBooks bills/purchases, pulled daily + by webhook)
 *                  + `time_entries.labor_cost` (crew time from the BuildOS clock)
 *   - estimate   ← `budget_lines` (revised, falling back to original), else jobs.estimated_cost
 *   - revenue    ← `job_billing` (QuickBooks invoices / payments) and the contract + approved COs
 *   - progress   ← `schedule_items` dates (nobody fills in percent_complete, so elapsed
 *                  schedule time is the honest signal), else cost-to-budget
 *
 * QB payroll tagged to jobs is tiny (~$600 on active jobs), so adding time-clock labor on top
 * of QB costs does not meaningfully double-count crew pay.
 *
 * "Margin to date" is margin on billings: (billed − spent) / billed. Almost no job carries a
 * contract amount yet, so billings are the only revenue figure that is real for most jobs.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { DIVISION_NAMES } from '@/lib/estimates/divisions'

type Admin = ReturnType<typeof createAdminClient>

export type CostClass = 'labor' | 'material' | 'sub' | 'other'
export const COST_CLASSES: CostClass[] = ['labor', 'material', 'sub', 'other']
export const COST_CLASS_LABEL: Record<CostClass, string> = {
  labor: 'Labor', material: 'Material', sub: 'Subcontract', other: 'Other',
}

export const TZ = 'America/New_York'
const WEEKS_TILE = 12
const WEEKS_PORTFOLIO = 26

// ── Small helpers ────────────────────────────────────────────────────────────

const PAGE = 1000

/** PostgREST caps a select at 1,000 rows; page through until a short page comes back. */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/** YYYY-MM-DD in JDC's timezone. */
export function localDate(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(typeof d === 'string' ? new Date(d) : d)
}

/** Monday (YYYY-MM-DD) of the week containing a YYYY-MM-DD date. */
function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

/** The last `n` Monday week-starts, oldest first, ending with the current week. */
function lastWeeks(n: number): string[] {
  const cur = new Date(`${weekStart(localDate(new Date()))}T12:00:00Z`)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cur)
    d.setUTCDate(d.getUTCDate() - i * 7)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

interface ActualRow {
  job_id: string
  amount: number | null
  incurred_date: string | null
  created_at: string
  cost_class: string | null
  qb_item_name: string | null
  vendor_name: string | null
  description: string | null
  budget_line_id: string | null
}

export function classOfActual(a: Pick<ActualRow, 'cost_class' | 'qb_item_name'>): CostClass {
  const c = (a.cost_class ?? '').toLowerCase()
  const n = (a.qb_item_name ?? '').toLowerCase()
  if (c.startsWith('sub') || n.includes('subcontract')) return 'sub'
  if (n.includes('payroll') || n.includes('labor')) return 'labor'
  if (c === 'material' || n.includes('material') || n.includes('suppl')) return 'material'
  return 'other'
}

/** "04 Concrete SI:Material" → "04 Concrete". GL accounts ("6090 Building Supplies") have no trade. */
export function tradeOfItem(name: string | null | undefined): string | null {
  const m = /^(\d{2})\s/.exec((name ?? '').trim())
  if (!m || !DIVISION_NAMES[m[1]]) return null
  return `${m[1]} ${DIVISION_NAMES[m[1]]}`
}

function tradeOfCostCode(code: string | null | undefined): string | null {
  const m = /^(\d{2})(\.|$|\s)/.exec((code ?? '').trim())
  if (!m || !DIVISION_NAMES[m[1]]) return null
  return `${m[1]} ${DIVISION_NAMES[m[1]]}`
}

/** Budget categories look like "04 Concrete", "06.000 Floor Framing", "Basement › 16 Electrical". */
function tradeOfCategory(cat: string | null | undefined, code: string | null | undefined): string | null {
  const fromCode = tradeOfCostCode(code)
  if (fromCode) return fromCode
  const last = (cat ?? '').split('›').pop()?.trim() ?? ''
  const m = /^(\d{1,2})(?:\.\d+)?\s/.exec(last)
  if (!m) return null
  const num = m[1].padStart(2, '0')
  return DIVISION_NAMES[num] ? `${num} ${DIVISION_NAMES[num]}` : null
}

interface TimeRow {
  id: string
  job_id: string | null
  user_id: string
  clock_in: string
  clock_out: string | null
  regular_hours: number | null
  overtime_hours: number | null
  break_minutes: number | null
  hourly_rate: number | null
  labor_cost: number | null
  cost_code: string | null
}

function entryHours(t: TimeRow): number {
  const h = (t.regular_hours ?? 0) + (t.overtime_hours ?? 0)
  if (h > 0 || !t.clock_out) return h
  const ms = Date.parse(t.clock_out) - Date.parse(t.clock_in)
  return Math.max(0, ms / 3_600_000 - (t.break_minutes ?? 0) / 60)
}

function entryCost(t: TimeRow): number {
  if (t.labor_cost != null && t.labor_cost > 0) return t.labor_cost
  return entryHours(t) * (t.hourly_rate ?? 0)
}

interface BillingRow {
  job_id: string
  qb_txn_type: string
  amount: number | null
  balance: number | null
  txn_date: string | null
  doc_number: string | null
}

function billedDelta(b: BillingRow): number {
  const amt = b.amount ?? 0
  if (b.qb_txn_type === 'Invoice' || b.qb_txn_type === 'SalesReceipt') return amt
  if (b.qb_txn_type === 'CreditMemo' || b.qb_txn_type === 'RefundReceipt') return -amt
  return 0
}

function collectedDelta(b: BillingRow): number {
  const amt = b.amount ?? 0
  if (b.qb_txn_type === 'Payment' || b.qb_txn_type === 'SalesReceipt') return amt
  if (b.qb_txn_type === 'RefundReceipt') return -amt
  return 0
}

interface ScheduleRow {
  job_id: string
  start_date: string | null
  end_date: string | null
  status: string | null
  percent_complete: number | null
}

/** Duration-weighted share of the schedule that is done (or, by the calendar, should be). */
function scheduleProgress(items: ScheduleRow[], today: string): number | null {
  let total = 0
  let done = 0
  for (const s of items) {
    if (!s.start_date) continue
    const end = s.end_date && s.end_date >= s.start_date ? s.end_date : s.start_date
    const dur = daysBetween(s.start_date, end) + 1
    let frac: number
    if (s.status === 'complete' || s.status === 'completed') frac = 1
    else if ((s.percent_complete ?? 0) > 0) frac = Math.min(1, (s.percent_complete ?? 0) / 100)
    else frac = Math.min(1, Math.max(0, (daysBetween(s.start_date, today) + 1) / dur))
    total += dur
    done += dur * frac
  }
  return total > 0 ? (done / total) * 100 : null
}

function sumApprovedCOs(rows: { job_id: string; status: string; type: string; amount: number | null }[], jobId?: string) {
  return rows
    .filter(co => (!jobId || co.job_id === jobId) && co.status === 'approved')
    .reduce((s, co) => s + (co.type === 'additive' ? (co.amount ?? 0) : co.type === 'deductive' ? -(co.amount ?? 0) : 0), 0)
}

export interface Financials {
  contract: number      // contract + approved change orders
  estimated: number     // budgeted cost
  spent: number         // QB costs + crew labor
  labor: number         // crew labor (time clock) + QB payroll
  billed: number
  collected: number
  openAR: number        // open balance on QB invoices
  hours: number
  marginPct: number | null     // on billings to date
  profit: number | null        // billed − spent
  projectedMarginPct: number | null // (contract − estimated) / contract
  progressPct: number | null
  progressBasis: 'schedule' | 'cost' | null
  budgetIncomplete: boolean    // spent well past an estimate that clearly isn't the whole job
}

function finish(f: Omit<Financials, 'marginPct' | 'profit' | 'projectedMarginPct' | 'progressPct' | 'progressBasis' | 'budgetIncomplete'>, schedulePct: number | null): Financials {
  const marginPct = f.billed > 0 ? ((f.billed - f.spent) / f.billed) * 100 : null
  const profit = f.billed > 0 ? f.billed - f.spent : null
  const projectedMarginPct = f.contract > 0 && f.estimated > 0 ? ((f.contract - f.estimated) / f.contract) * 100 : null
  const budgetIncomplete = f.estimated > 0 && f.spent > f.estimated * 1.5
  let progressPct: number | null = null
  let progressBasis: Financials['progressBasis'] = null
  if (schedulePct != null) { progressPct = schedulePct; progressBasis = 'schedule' }
  else if (f.estimated > 0 && !budgetIncomplete) { progressPct = Math.min(100, (f.spent / f.estimated) * 100); progressBasis = 'cost' }
  return { ...f, marginPct, profit, projectedMarginPct, progressPct, progressBasis, budgetIncomplete }
}

// ── Live crew ────────────────────────────────────────────────────────────────

export interface LiveShift {
  id: string
  userId: string
  name: string
  jobId: string | null
  jobName: string
  clockIn: string
  costCode: string | null
  hourlyRate: number
}

export async function loadLiveCrew(admin: Admin = createAdminClient()): Promise<LiveShift[]> {
  const { data, error } = await admin
    .from('time_entries')
    .select('id, user_id, job_id, clock_in, cost_code, hourly_rate, user:users!time_entries_user_id_fkey(full_name, hourly_rate), job:jobs(name)')
    .is('clock_out', null)
    .order('clock_in', { ascending: true })
  if (error) throw error
  type Row = {
    id: string; user_id: string; job_id: string | null; clock_in: string; cost_code: string | null; hourly_rate: number | null
    user: { full_name: string | null; hourly_rate: number | null } | null
    job: { name: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.id,
    userId: r.user_id,
    name: r.user?.full_name ?? 'Unknown',
    jobId: r.job_id,
    jobName: r.job?.name ?? 'No job',
    clockIn: r.clock_in,
    costCode: r.cost_code,
    hourlyRate: r.hourly_rate ?? r.user?.hourly_rate ?? 0,
  }))
}

// ── Portfolio ────────────────────────────────────────────────────────────────

export interface JobTile extends Financials {
  id: string
  name: string
  jobNumber: string
  clientName: string | null
  status: string
  weekly: number[]          // spend per week, oldest first (WEEKS_TILE)
  lastActivity: string | null
}

export interface PortfolioWeek {
  week: string
  labor: number
  material: number
  sub: number
  other: number
}

export interface Portfolio {
  jobs: JobTile[]
  weeks: PortfolioWeek[]
  laborThisWeek: number
  hoursThisWeek: number
  generatedAt: string
}

const PORTFOLIO_STATUSES = ['active', 'warranty', 'presale']

export async function loadPortfolio(admin: Admin = createAdminClient()): Promise<Portfolio> {
  const { data: jobs, error } = await admin
    .from('jobs')
    .select('id, name, job_number, client_name, status, contract_amount, estimated_cost')
    .in('status', PORTFOLIO_STATUSES)
    .order('name')
  if (error) throw error
  const ids = (jobs ?? []).map(j => j.id)
  if (ids.length === 0) return { jobs: [], weeks: [], laborThisWeek: 0, hoursThisWeek: 0, generatedAt: new Date().toISOString() }

  const [actuals, entries, billing, budget, schedule, cos] = await Promise.all([
    selectAll<ActualRow>((f, t) => admin.from('actuals')
      .select('job_id, amount, incurred_date, created_at, cost_class, qb_item_name, vendor_name, description, budget_line_id')
      .in('job_id', ids).order('id').range(f, t)),
    selectAll<TimeRow>((f, t) => admin.from('time_entries')
      .select('id, job_id, user_id, clock_in, clock_out, regular_hours, overtime_hours, break_minutes, hourly_rate, labor_cost, cost_code')
      .in('job_id', ids).order('id').range(f, t)),
    selectAll<BillingRow>((f, t) => admin.from('job_billing')
      .select('job_id, qb_txn_type, amount, balance, txn_date, doc_number')
      .in('job_id', ids).order('id').range(f, t)),
    selectAll<{ job_id: string; original_budget: number | null; revised_budget: number | null }>((f, t) => admin.from('budget_lines')
      .select('job_id, original_budget, revised_budget')
      .in('job_id', ids).order('id').range(f, t)),
    selectAll<ScheduleRow>((f, t) => admin.from('schedule_items')
      .select('job_id, start_date, end_date, status, percent_complete')
      .in('job_id', ids).order('id').range(f, t)),
    selectAll<{ job_id: string; status: string; type: string; amount: number | null }>((f, t) => admin.from('change_orders')
      .select('job_id, status, type, amount')
      .in('job_id', ids).order('id').range(f, t)),
  ])

  const today = localDate(new Date())
  const tileWeeks = lastWeeks(WEEKS_TILE)
  const portWeeks = lastWeeks(WEEKS_PORTFOLIO)
  const tileIdx = new Map(tileWeeks.map((w, i) => [w, i]))
  const portIdx = new Map(portWeeks.map((w, i) => [w, i]))
  const thisWeek = portWeeks[portWeeks.length - 1]

  const weeks: PortfolioWeek[] = portWeeks.map(week => ({ week, labor: 0, material: 0, sub: 0, other: 0 }))
  type Acc = { estimated: number; spent: number; labor: number; billed: number; collected: number; openAR: number; hours: number; weekly: number[]; last: string | null; schedule: ScheduleRow[] }
  const acc = new Map<string, Acc>(ids.map(id => [id, { estimated: 0, spent: 0, labor: 0, billed: 0, collected: 0, openAR: 0, hours: 0, weekly: Array(WEEKS_TILE).fill(0), last: null, schedule: [] }]))
  const touch = (a: Acc, d: string) => { if (!a.last || d > a.last) a.last = d }

  for (const a of actuals) {
    const j = acc.get(a.job_id); if (!j) continue
    const amt = a.amount ?? 0
    const cls = classOfActual(a)
    const d = a.incurred_date ?? localDate(a.created_at)
    j.spent += amt
    if (cls === 'labor') j.labor += amt
    touch(j, d)
    const wk = weekStart(d)
    const ti = tileIdx.get(wk); if (ti != null) j.weekly[ti] += amt
    const pi = portIdx.get(wk); if (pi != null) weeks[pi][cls] += amt
  }

  let laborThisWeek = 0
  let hoursThisWeek = 0
  for (const t of entries) {
    const j = t.job_id ? acc.get(t.job_id) : undefined; if (!j) continue
    const cost = entryCost(t)
    const hrs = entryHours(t)
    const d = localDate(t.clock_in)
    j.spent += cost; j.labor += cost; j.hours += hrs
    touch(j, d)
    const wk = weekStart(d)
    const ti = tileIdx.get(wk); if (ti != null) j.weekly[ti] += cost
    const pi = portIdx.get(wk); if (pi != null) weeks[pi].labor += cost
    if (wk === thisWeek) { laborThisWeek += cost; hoursThisWeek += hrs }
  }

  for (const b of billing) {
    const j = acc.get(b.job_id); if (!j) continue
    j.billed += billedDelta(b)
    j.collected += collectedDelta(b)
    if (b.qb_txn_type === 'Invoice') j.openAR += b.balance ?? 0
  }
  for (const l of budget) {
    const j = acc.get(l.job_id); if (!j) continue
    j.estimated += (l.revised_budget ?? 0) > 0 ? (l.revised_budget ?? 0) : (l.original_budget ?? 0)
  }
  for (const s of schedule) acc.get(s.job_id)?.schedule.push(s)

  const tiles: JobTile[] = (jobs ?? []).map(job => {
    const a = acc.get(job.id)!
    const fin = finish({
      contract: (job.contract_amount ?? 0) + sumApprovedCOs(cos, job.id),
      estimated: a.estimated > 0 ? a.estimated : (job.estimated_cost ?? 0),
      spent: a.spent, labor: a.labor, billed: a.billed, collected: a.collected, openAR: a.openAR, hours: a.hours,
    }, scheduleProgress(a.schedule, today))
    return {
      ...fin,
      id: job.id,
      name: job.name ?? '',
      jobNumber: job.job_number ?? '',
      clientName: job.client_name ?? null,
      status: job.status,
      weekly: a.weekly,
      lastActivity: a.last,
    }
  })

  return { jobs: tiles, weeks, laborThisWeek, hoursThisWeek, generatedAt: new Date().toISOString() }
}

// ── Single job ───────────────────────────────────────────────────────────────

export interface TradeRow { trade: string; budget: number; spent: number }
export interface CrewRow { userId: string; name: string; hours: number; cost: number; lastOn: string | null }
export interface VendorRow { vendor: string; amount: number; lines: number }
export interface CumulativePoint { date: string; spent: number; billed: number }
export interface TxnRow { date: string; kind: CostClass; vendor: string; description: string; trade: string | null; amount: number }
export interface WeekHours { week: string; hours: number; cost: number }

export interface JobDetail {
  job: { id: string; name: string; jobNumber: string; clientName: string | null; status: string; siteAddress: string | null }
  fin: Financials
  mix: Record<CostClass, number>
  trades: TradeRow[]
  crew: CrewRow[]
  vendors: VendorRow[]
  cumulative: CumulativePoint[]
  weeklyHours: WeekHours[]
  recent: TxnRow[]
  invoices: { date: string | null; doc: string | null; amount: number; balance: number }[]
}

export async function loadJobDetail(jobId: string, admin: Admin = createAdminClient()): Promise<JobDetail | null> {
  const { data: job } = await admin
    .from('jobs')
    .select('id, name, job_number, client_name, status, site_address, city, contract_amount, estimated_cost')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return null

  const [actuals, entries, billing, budget, schedule, cos, users] = await Promise.all([
    selectAll<ActualRow>((f, t) => admin.from('actuals')
      .select('job_id, amount, incurred_date, created_at, cost_class, qb_item_name, vendor_name, description, budget_line_id')
      .eq('job_id', jobId).order('id').range(f, t)),
    selectAll<TimeRow>((f, t) => admin.from('time_entries')
      .select('id, job_id, user_id, clock_in, clock_out, regular_hours, overtime_hours, break_minutes, hourly_rate, labor_cost, cost_code')
      .eq('job_id', jobId).order('id').range(f, t)),
    selectAll<BillingRow>((f, t) => admin.from('job_billing')
      .select('job_id, qb_txn_type, amount, balance, txn_date, doc_number')
      .eq('job_id', jobId).order('id').range(f, t)),
    selectAll<{ id: string; job_id: string; original_budget: number | null; revised_budget: number | null; category: string | null; cost_code: string | null }>((f, t) => admin.from('budget_lines')
      .select('id, job_id, original_budget, revised_budget, category, cost_code')
      .eq('job_id', jobId).order('id').range(f, t)),
    selectAll<ScheduleRow>((f, t) => admin.from('schedule_items')
      .select('job_id, start_date, end_date, status, percent_complete')
      .eq('job_id', jobId).order('id').range(f, t)),
    selectAll<{ job_id: string; status: string; type: string; amount: number | null }>((f, t) => admin.from('change_orders')
      .select('job_id, status, type, amount')
      .eq('job_id', jobId).order('id').range(f, t)),
    admin.from('users').select('id, full_name').then(r => r.data ?? []),
  ])

  const today = localDate(new Date())
  const userName = new Map(users.map(u => [u.id, u.full_name ?? 'Unknown']))
  const budgetTrade = new Map<string, string | null>()
  const UNCODED = 'Uncoded'

  const mix: Record<CostClass, number> = { labor: 0, material: 0, sub: 0, other: 0 }
  const tradeMap = new Map<string, TradeRow>()
  const tradeRow = (t: string) => {
    let r = tradeMap.get(t)
    if (!r) { r = { trade: t, budget: 0, spent: 0 }; tradeMap.set(t, r) }
    return r
  }

  let estimated = 0
  for (const l of budget) {
    const amt = (l.revised_budget ?? 0) > 0 ? (l.revised_budget ?? 0) : (l.original_budget ?? 0)
    estimated += amt
    const tr = tradeOfCategory(l.category, l.cost_code)
    budgetTrade.set(l.id, tr)
    tradeRow(tr ?? UNCODED).budget += amt
  }

  const daily = new Map<string, { spent: number; billed: number }>()
  const day = (d: string) => {
    let r = daily.get(d)
    if (!r) { r = { spent: 0, billed: 0 }; daily.set(d, r) }
    return r
  }

  const vendorMap = new Map<string, VendorRow>()
  const recent: TxnRow[] = []
  let spent = 0
  for (const a of actuals) {
    const amt = a.amount ?? 0
    const cls = classOfActual(a)
    const d = a.incurred_date ?? localDate(a.created_at)
    const trade = tradeOfItem(a.qb_item_name) ?? (a.budget_line_id ? budgetTrade.get(a.budget_line_id) ?? null : null)
    spent += amt
    mix[cls] += amt
    tradeRow(trade ?? UNCODED).spent += amt
    day(d).spent += amt
    const v = (a.vendor_name ?? '').trim() || 'Unknown vendor'
    const vr = vendorMap.get(v) ?? { vendor: v, amount: 0, lines: 0 }
    vr.amount += amt; vr.lines += 1
    vendorMap.set(v, vr)
    recent.push({ date: d, kind: cls, vendor: v, description: a.description ?? a.qb_item_name ?? '', trade, amount: amt })
  }

  const crewMap = new Map<string, CrewRow>()
  const hourWeeks = lastWeeks(16)
  const hwIdx = new Map(hourWeeks.map((w, i) => [w, i]))
  const weeklyHours: WeekHours[] = hourWeeks.map(week => ({ week, hours: 0, cost: 0 }))
  let labor = mix.labor
  let hours = 0
  for (const t of entries) {
    const cost = entryCost(t)
    const hrs = entryHours(t)
    const d = localDate(t.clock_in)
    spent += cost; labor += cost; hours += hrs
    mix.labor += cost
    tradeRow(tradeOfCostCode(t.cost_code) ?? 'Crew labor (no cost code)').spent += cost
    day(d).spent += cost
    const c = crewMap.get(t.user_id) ?? { userId: t.user_id, name: userName.get(t.user_id) ?? 'Unknown', hours: 0, cost: 0, lastOn: null }
    c.hours += hrs; c.cost += cost
    if (!c.lastOn || d > c.lastOn) c.lastOn = d
    crewMap.set(t.user_id, c)
    const wi = hwIdx.get(weekStart(d))
    if (wi != null) { weeklyHours[wi].hours += hrs; weeklyHours[wi].cost += cost }
  }

  let billed = 0
  let collected = 0
  let openAR = 0
  const invoices: JobDetail['invoices'] = []
  for (const b of billing) {
    billed += billedDelta(b)
    collected += collectedDelta(b)
    if (b.txn_date) day(b.txn_date).billed += billedDelta(b)
    if (b.qb_txn_type === 'Invoice') openAR += b.balance ?? 0
    if (b.qb_txn_type === 'Invoice') invoices.push({ date: b.txn_date, doc: b.doc_number, amount: b.amount ?? 0, balance: b.balance ?? 0 })
  }
  invoices.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const cumulative: CumulativePoint[] = []
  let cs = 0
  let cb = 0
  for (const d of [...daily.keys()].sort()) {
    if (d > today) continue
    const r = daily.get(d)!
    cs += r.spent; cb += r.billed
    cumulative.push({ date: d, spent: cs, billed: cb })
  }
  if (cumulative.length && cumulative[cumulative.length - 1].date !== today) cumulative.push({ date: today, spent: cs, billed: cb })

  const fin = finish({
    contract: (job.contract_amount ?? 0) + sumApprovedCOs(cos),
    estimated: estimated > 0 ? estimated : (job.estimated_cost ?? 0),
    spent, labor, billed, collected, openAR, hours,
  }, scheduleProgress(schedule, today))

  recent.sort((a, b) => b.date.localeCompare(a.date))

  return {
    job: {
      id: job.id, name: job.name ?? '', jobNumber: job.job_number ?? '', clientName: job.client_name ?? null, status: job.status,
      siteAddress: [job.site_address, job.city].filter(Boolean).join(', ') || null,
    },
    fin,
    mix,
    trades: [...tradeMap.values()].filter(t => t.budget > 0 || t.spent > 0).sort((a, b) => Math.max(b.spent, b.budget) - Math.max(a.spent, a.budget)),
    crew: [...crewMap.values()].sort((a, b) => b.hours - a.hours),
    vendors: [...vendorMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 10),
    cumulative,
    weeklyHours,
    recent: recent.slice(0, 25),
    invoices: invoices.slice(0, 10),
  }
}
