import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { askFixer } from '@/lib/hermes/fixerApi'
import { loadPayroll, parseRange } from '@/lib/payrollServer'
import { periodLabel } from '@/lib/payroll'

export const runtime = 'nodejs'
// Fixer is an LLM agent: starting its turn, running the script and replying can take a while.
export const maxDuration = 300

const MAILBOX = 'customerservice@jdcremodeling.com'
const RECIPIENT = 'teresa.applegate@elcorsolutions.com'
const SCRIPT = '/opt/data/scripts/create_payroll_draft.py'

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

// POST {start,end} → ask Fixer to create the Outlook DRAFT (never sent).
// Fixer runs a fixed script on the Hermes server that downloads the PDF from
// /api/time-clock/payroll-pdf and creates the draft through Microsoft Graph.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const range = parseRange(body.start, body.end)
  if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })

  let shifts = 0
  try {
    const r = await loadPayroll(auth.admin, range.start, range.end)
    shifts = r.groups.reduce((s, g) => s + g.lines.length, 0)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load shifts' }, { status: 500 })
  }
  if (shifts === 0) {
    return NextResponse.json({ error: 'No completed shifts in that pay period.' }, { status: 400 })
  }

  const label = periodLabel(range.start, range.end)
  const prompt =
    'Payroll task from BuildOS. Do exactly this and nothing else: run this command in your terminal and do not modify it:\n\n' +
    `python3 ${SCRIPT} ${range.start} ${range.end} "${label}"\n\n` +
    'It creates an Outlook DRAFT (it does not send anything). Reply with the command\'s output copied exactly, ' +
    'with no summary. Do not send, edit or delete any email.'

  let reply: string
  try {
    reply = await askFixer(prompt, [], 240_000)
  } catch (e) {
    return NextResponse.json(
      { error: `Fixer could not be reached: ${e instanceof Error ? e.message : 'unknown error'}` },
      { status: 502 },
    )
  }

  // The script prints DRAFT_CREATED or DRAFT_EXISTS on success; anything else is a failure.
  const exists = /DRAFT_EXISTS/.test(reply)
  if (!exists && !/DRAFT_CREATED/.test(reply)) {
    return NextResponse.json(
      { error: 'Fixer did not confirm the draft was created.', detail: reply.slice(0, 400) },
      { status: 502 },
    )
  }

  return NextResponse.json({
    success: true, mailbox: MAILBOX, recipient: RECIPIENT, period: label, alreadyExisted: exists,
  })
}
