// Shared payroll helpers: pay-period defaults, grouping time entries into the
// Time Clock Report, and rendering it as a PDF. All dates are interpreted in the
// company timezone so the server (UTC) and the browser agree on which day a shift
// belongs to.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const PAYROLL_TZ = 'America/New_York'

export interface PayrollEntry {
  id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  regular_hours: number | null
  overtime_hours: number | null
  approval_status?: string | null
  user?: { full_name: string | null } | null
  job?: { name: string } | null
}

export interface PayrollLine {
  date: string
  job: string
  first: string
  last: string
  timeIn: string
  timeOut: string
  minutes: number
}

export interface PayrollGroup { name: string; lines: PayrollLine[]; minutes: number }

export interface PayrollResult {
  groups: PayrollGroup[]
  openCount: number
  unapprovedCount: number
  totalMinutes: number
}

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** YYYY-MM-DD of an instant in the company timezone. */
export function tzYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PAYROLL_TZ }).format(d)
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Previous Monday–Sunday relative to `today` (Mon 11/9 → 11/2–11/8). */
export function defaultPayPeriod(today: Date = new Date()): { start: string; end: string } {
  const ymd = tzYmd(today)
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const sinceMonday = (dow + 6) % 7
  const start = addDays(ymd, -sinceMonday - 7)
  return { start, end: addDays(start, 6) }
}

/** "11/2/2026" from "2026-11-02". */
export function usDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${m}/${d}/${y}`
}

export function periodLabel(start: string, end: string): string {
  return `${usDate(start)} - ${usDate(end)}`
}

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PAYROLL_TZ })
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: PAYROLL_TZ,
  })

/** Group completed shifts starting on [start, end] (inclusive) per employee. */
export function buildPayroll(entries: PayrollEntry[], start: string, end: string): PayrollResult {
  const byUser = new Map<string, PayrollGroup>()
  let openCount = 0
  let unapprovedCount = 0

  const sorted = [...entries].sort((a, b) => a.clock_in.localeCompare(b.clock_in))
  for (const e of sorted) {
    const inD = new Date(e.clock_in)
    const day = tzYmd(inD)
    if (day < start || day > end) continue
    if (!e.clock_out) { openCount++; continue } // unfinished shifts can't be paid yet
    if (e.approval_status && e.approval_status !== 'approved') unapprovedCount++

    const outD = new Date(e.clock_out)
    const hours = (e.regular_hours ?? 0) + (e.overtime_hours ?? 0)
    const minutes = hours > 0
      ? Math.round(hours * 60)
      : Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000))

    const full = (e.user?.full_name ?? 'Unknown').trim()
    const [first, ...rest] = full.split(/\s+/)
    const g = byUser.get(e.user_id) ?? { name: full, lines: [], minutes: 0 }
    g.lines.push({
      date: fmtDate(inD), job: e.job?.name ?? '', first, last: rest.join(' '),
      timeIn: fmtTime(inD), timeOut: fmtTime(outD), minutes,
    })
    g.minutes += minutes
    byUser.set(e.user_id, g)
  }

  const groups = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name))
  return {
    groups, openCount, unapprovedCount,
    totalMinutes: groups.reduce((s, g) => s + g.minutes, 0),
  }
}

/** Render the Time Clock Report as a letter-landscape PDF. */
export async function renderPayrollPdf(groups: PayrollGroup[], exportedOn: Date = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const W = 792, H = 612, M = 36
  const rowH = 13
  // x positions: Date, Job, First, Last, In, Out, Total
  const cols = [M, 250, 400, 460, 540, 600, 670]
  const exported = exportedOn.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: PAYROLL_TZ,
  })

  let page = pdf.addPage([W, H])
  let y = H - M

  const text = (s: string, x: number, yy: number, opts: { b?: boolean; size?: number } = {}) =>
    page.drawText(s, { x, y: yy, size: opts.size ?? 8.5, font: opts.b ? bold : font, color: rgb(0, 0, 0) })

  const header = () => {
    text(`Time Clock Report (exported on ${exported})`, M, y, { b: true, size: 11 })
    y -= 22
    const labels = ['Date', 'Job', 'First Name', 'Last Name', 'Time In', 'Time Out', 'Total Work Time']
    labels.forEach((l, i) => text(l, cols[i], y, { size: 9 }))
    page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.7, color: rgb(0, 0, 0) })
    y -= 16
  }
  const ensure = (rows: number) => {
    if (y - rows * rowH < M) {
      page = pdf.addPage([W, H])
      y = H - M
      header()
    }
  }

  header()
  for (const g of groups) {
    ensure(Math.min(g.lines.length, 3) + 2)
    for (const l of g.lines) {
      ensure(2)
      text(l.date, cols[0], y)
      text(l.job.slice(0, 34), cols[1], y)
      text(l.first, cols[2], y)
      text(l.last, cols[3], y)
      text(l.timeIn, cols[4], y)
      text(l.timeOut, cols[5], y)
      text(hhmm(l.minutes), cols[6], y)
      y -= rowH
    }
    ensure(2)
    text('Total Time', cols[5], y, { b: true })
    text(hhmm(g.minutes), cols[6], y, { b: true })
    y -= rowH * 2
  }

  if (groups.length === 0) text('No completed shifts in this pay period.', M, y)
  return pdf.save()
}
