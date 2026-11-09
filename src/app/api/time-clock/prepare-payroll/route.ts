import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphFetch, isGraphConfigured } from '@/lib/integrations/microsoft/graphClient'
import {
  addDays, buildPayroll, periodLabel, renderPayrollPdf, usDate, type PayrollEntry,
} from '@/lib/payroll'

export const runtime = 'nodejs'

const MAILBOX = process.env.PAYROLL_DRAFT_MAILBOX || 'customerservice@jdcremodeling.com'
const RECIPIENT = process.env.PAYROLL_RECIPIENT || 'teresa.applegate@elcorsolutions.com'
const YMD = /^\d{4}-\d{2}-\d{2}$/

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  if (!perm?.can_manage) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { admin }
}

async function loadPayroll(admin: ReturnType<typeof createAdminClient>, start: string, end: string) {
  // Padded window; buildPayroll trims to the exact company-timezone days.
  const from = new Date(`${addDays(start, -1)}T00:00:00Z`)
  const to = new Date(`${addDays(end, 2)}T00:00:00Z`)
  const { data, error } = await admin
    .from('time_entries')
    .select(
      'id, user_id, clock_in, clock_out, regular_hours, overtime_hours, approval_status, user:users!user_id(full_name), job:jobs!job_id(name)',
    )
    .gte('clock_in', from.toISOString())
    .lt('clock_in', to.toISOString())
    .order('clock_in', { ascending: true })
    .range(0, 4999)
  if (error) throw new Error(error.message)
  return buildPayroll((data ?? []) as unknown as PayrollEntry[], start, end)
}

function parseRange(start: unknown, end: unknown) {
  if (typeof start !== 'string' || typeof end !== 'string' || !YMD.test(start) || !YMD.test(end)) return null
  if (end < start) return null
  if (end > addDays(start, 31)) return null // sanity cap: one pay period, not a year
  return { start, end }
}

// GET ?start&end → summary for the confirm popup (no side effects)
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get('start'), url.searchParams.get('end'))
  if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  try {
    const r = await loadPayroll(auth.admin, range.start, range.end)
    return NextResponse.json({
      employees: r.groups.length,
      shifts: r.groups.reduce((s, g) => s + g.lines.length, 0),
      totalMinutes: r.totalMinutes,
      openCount: r.openCount,
      unapprovedCount: r.unapprovedCount,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load shifts' }, { status: 500 })
  }
}

// POST {start,end} → build PDF and create an Outlook DRAFT (never sent)
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const range = parseRange(body.start, body.end)
  if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Microsoft Graph is not configured on this server.' }, { status: 503 })
  }

  let result
  try {
    result = await loadPayroll(auth.admin, range.start, range.end)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load shifts' }, { status: 500 })
  }
  if (result.groups.length === 0) {
    return NextResponse.json({ error: 'No completed shifts in that pay period.' }, { status: 400 })
  }

  const pdf = await renderPayrollPdf(result.groups)
  const label = periodLabel(range.start, range.end)
  const fileName = `Payroll ${usDate(range.start).replace(/\//g, '-')} to ${usDate(range.end).replace(/\//g, '-')}.pdf`

  const res = await graphFetch(`/users/${encodeURIComponent(MAILBOX)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject: `Payroll - ${label}`,
      body: {
        contentType: 'Text',
        content: `Hello,\n\nAttached is the payroll document for the pay period of ${label}.\n\nThanks,\nEvelyn`,
      },
      toRecipients: [{ emailAddress: { address: RECIPIENT } }],
      attachments: [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: fileName,
        contentType: 'application/pdf',
        contentBytes: Buffer.from(pdf).toString('base64'),
      }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const hint = res.status === 403
      ? ` The Azure app needs the Mail.ReadWrite application permission (with admin consent) and access to ${MAILBOX}.`
      : ''
    return NextResponse.json(
      { error: `Could not create the Outlook draft (${res.status}).${hint}`, detail: text.slice(0, 300) },
      { status: 502 },
    )
  }

  return NextResponse.json({ success: true, mailbox: MAILBOX, recipient: RECIPIENT, period: label, fileName })
}
