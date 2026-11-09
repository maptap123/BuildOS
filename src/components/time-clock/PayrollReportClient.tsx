'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Download, ChevronLeft, ChevronRight } from 'lucide-react'

interface Entry {
  id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  regular_hours: number | null
  overtime_hours: number | null
  user?: { full_name: string | null } | null
  job?: { name: string } | null
}

interface Line {
  date: string
  job: string
  first: string
  last: string
  timeIn: string
  timeOut: string
  minutes: number
}

interface Group { name: string; lines: Line[]; minutes: number }

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function PayrollReportClient({ start, entries }: { start: string; entries: Entry[] }) {
  const router = useRouter()
  const end = addDays(start, 6)

  const { groups, openCount } = useMemo(() => {
    const startMs = new Date(`${start}T00:00:00`).getTime()
    const endMs = new Date(`${addDays(start, 7)}T00:00:00`).getTime()
    const byUser = new Map<string, Group>()
    let open = 0

    for (const e of entries) {
      const inD = new Date(e.clock_in)
      if (inD.getTime() < startMs || inD.getTime() >= endMs) continue
      if (!e.clock_out) { open++; continue } // unfinished shifts can't be paid yet
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
    return { groups, openCount: open }
  }, [entries, start])

  const exported = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  function go(newStart: string) { router.push(`/time-clock/shifts/payroll?start=${newStart}`) }

  function exportCSV() {
    const rows = [['Date', 'Job', 'First Name', 'Last Name', 'Time In', 'Time Out', 'Total Work Time']]
    for (const g of groups) {
      for (const l of g.lines) rows.push([l.date, l.job, l.first, l.last, l.timeIn, l.timeOut, hhmm(l.minutes)])
      rows.push(['', '', '', '', '', 'Total Time', hhmm(g.minutes)])
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Payroll ${start} to ${end}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Standalone printable page so the app's sidebar/nav never ends up in the PDF
  function printReport() {
    const body = groups.map((g) => `
      ${g.lines.map((l) => `<tr><td class="d">${esc(l.date)}</td><td>${esc(l.job)}</td><td>${esc(l.first)}</td><td>${esc(l.last)}</td><td>${l.timeIn}</td><td>${l.timeOut}</td><td class="t">${hhmm(l.minutes)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5"></td><td>Total Time</td><td class="t">${hhmm(g.minutes)}</td></tr>
      <tr class="sp"><td colspan="7"></td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Payroll ${start} to ${end}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;margin:24px;color:#000}
      h1{font-size:11pt;margin:0 0 14px}
      table{border-collapse:collapse;width:100%}
      th{text-align:left;border-bottom:1px solid #000;padding:2px 6px;font-weight:normal;text-decoration:underline}
      td{padding:2px 6px;white-space:nowrap}
      td.d{text-align:right;font-size:8.5pt} td.t{font-size:8.5pt}
      tr.tot td{font-weight:bold} tr.sp td{height:14px}
      @page{size:letter landscape;margin:0.5in}
    </style></head><body>
      <h1>Time Clock Report (exported on ${esc(exported)})</h1>
      <table><thead><tr><th>Date</th><th>Job</th><th>First Name</th><th>Last Name</th><th>Time In</th><th>Time Out</th><th>Total Work Time</th></tr></thead>
      <tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print()}<\/script>
    </body></html>`)
    w.document.close()
  }

  const grand = groups.reduce((s, g) => s + g.minutes, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/time-clock/shifts" className="text-gray-400 hover:text-navy-900 transition-colors p-1">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold text-navy-900">Payroll Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtDate(new Date(`${start}T12:00:00`))} &ndash; {fmtDate(new Date(`${end}T12:00:00`))}
            </p>
          </div>
        </div>
        <div className="flex gap-2 md:shrink-0">
          <button
            onClick={printReport}
            disabled={groups.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 px-3 py-2 rounded-lg disabled:opacity-40"
          >
            <Printer size={13} /> Print / Save PDF
          </button>
          <button
            onClick={exportCSV}
            disabled={groups.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-white border border-gray-200 hover:border-navy-300 px-3 py-2 rounded-lg disabled:opacity-40"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go(addDays(start, -7))} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-gray-400" aria-label="Previous week">
          <ChevronLeft size={14} />
        </button>
        <input
          type="date"
          value={start}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          aria-label="Week start"
        />
        <button onClick={() => go(addDays(start, 7))} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-gray-400" aria-label="Next week">
          <ChevronRight size={14} />
        </button>
        <span className="text-xs text-gray-400">Week runs 7 days from the start date (Mon&ndash;Sun when started on a Monday)</span>
      </div>

      {openCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {openCount} shift{openCount === 1 ? ' is' : 's are'} still clocked in and not included. Clock them out on the Shifts page first.
        </p>
      )}

      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No completed shifts this week.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold text-gray-500">
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Job</th>
                <th className="px-3 py-2.5">First Name</th>
                <th className="px-3 py-2.5">Last Name</th>
                <th className="px-3 py-2.5">Time In</th>
                <th className="px-3 py-2.5">Time Out</th>
                <th className="px-3 py-2.5 text-right">Total Work Time</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.name} className="border-b border-gray-200">
                {g.lines.map((l, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs">{l.date}</td>
                    <td className="px-3 py-1.5">{l.job}</td>
                    <td className="px-3 py-1.5">{l.first}</td>
                    <td className="px-3 py-1.5">{l.last}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{l.timeIn}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{l.timeOut}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{hhmm(l.minutes)}</td>
                  </tr>
                ))}
                <tr className="font-bold text-navy-900 bg-gray-50">
                  <td colSpan={5} />
                  <td className="px-3 py-2">Total Time</td>
                  <td className="px-3 py-2 text-right tabular-nums">{hhmm(g.minutes)}</td>
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr className="font-bold text-navy-900">
                <td colSpan={5} />
                <td className="px-3 py-3">All Employees</td>
                <td className="px-3 py-3 text-right tabular-nums">{hhmm(grand)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
