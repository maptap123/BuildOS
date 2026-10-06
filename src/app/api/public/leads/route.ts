import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getAdminUserIds } from '@/lib/notifications'
import { NextResponse } from 'next/server'

// Public lead intake for the jdcremodeling.com quote form (replaces the
// BuilderTrend contact-form iframe). No session — anyone on the internet can
// hit this, so every field is length-capped and bots are dropped quietly.

const ALLOWED_ORIGINS = new Set([
  'https://jdcremodeling.com',
  'https://www.jdcremodeling.com',
])

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://jdcremodeling.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

function clean(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get('origin'))
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return reply({ error: 'Invalid request' }, 400)
  }

  // Honeypot field is hidden from people; a filled one, or a form submitted
  // faster than a human could type, is a bot. Report success so it moves on.
  const elapsed = Number(body.elapsed_ms)
  if (clean(body.website) || (Number.isFinite(elapsed) && elapsed < 3000)) {
    return reply({ ok: true })
  }

  const first   = clean(body.first_name, 80)
  const last    = clean(body.last_name, 80)
  const email   = clean(body.email, 160).toLowerCase()
  const phone   = clean(body.phone, 40)
  const project = clean(body.project_type, 80)

  if (!first || !last) return reply({ error: 'Please enter your first and last name.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'Please enter a valid email.' }, 400)
  if (phone.replace(/\D/g, '').length < 10) return reply({ error: 'Please enter a valid phone number.' }, 400)

  const admin = createAdminClient()

  // A double-click or a resubmit after a slow network shouldn't create two leads.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('leads')
    .select('id')
    .ilike('client_email', email)
    .gte('created_at', since)
    .limit(1)
  if (recent?.length) return reply({ ok: true })

  const street = clean(body.address)
  const city   = clean(body.city, 80)
  const state  = clean(body.state, 40)
  const zip    = clean(body.zip, 20)
  const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const address  = [street, cityLine].filter(Boolean).join(', ')

  const answers: [string, string][] = [
    ['Project type',     project],
    ['Budget',           clean(body.budget, 80)],
    ['Bank financed',    clean(body.financed, 80)],
    ['Has blueprints',   clean(body.blueprints, 80)],
    ['Heard about us',   clean(body.heard_about, 200)],
  ]
  const message = clean(body.message, 5000)
  const notes = [
    'Submitted via jdcremodeling.com quote form.',
    ...answers.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    message ? `\nMessage:\n${message}` : '',
  ].filter(Boolean).join('\n')

  const clientName = `${first} ${last}`
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      title:        project ? `${project} – ${clientName}` : clientName,
      client_name:  clientName,
      client_email: email,
      client_phone: phone,
      address:      address || null,
      source:       'website',
      status:       'new',
      notes,
    })
    .select('id, title')
    .single()

  if (error || !lead) {
    console.error('[public/leads] insert failed', error)
    return reply({ error: 'Something went wrong. Please call us instead.' }, 500)
  }

  // Website leads are time-sensitive (the site promises a reply within one
  // business day), so admins get a text as well as the in-app alert.
  await notify({
    admin,
    userIds: await getAdminUserIds(admin),
    type: 'lead_created',
    title: `New website lead: ${lead.title}`,
    body: `${clientName} · ${phone}`,
    link: `/leads/${lead.id}`,
    urgent: true,
  })

  return reply({ ok: true }, 201)
}
