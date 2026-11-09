import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPayroll, parseRange } from '@/lib/payrollServer'
import { renderPayrollPdf } from '@/lib/payroll'

export const runtime = 'nodejs'

// Serves the payroll PDF to Fixer (the Hermes agent), which attaches it to the
// Outlook draft. Same bearer key Fixer already uses for /api/agent.
export async function GET(request: Request) {
  const configured = process.env.HERMES_JDC_API_KEY
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const a = Buffer.from(token ?? '')
  const b = Buffer.from(configured ?? '')
  if (!configured || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get('start'), url.searchParams.get('end'))
  if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })

  const result = await loadPayroll(createAdminClient(), range.start, range.end)
  if (result.groups.length === 0) {
    return NextResponse.json({ error: 'No completed shifts in that pay period.' }, { status: 404 })
  }
  const pdf = await renderPayrollPdf(result.groups)
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
  })
}
