import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { findMessage, isTeamMailbox, type FullMessage } from '@/lib/leads/emailSync'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string; activityId: string }> }

/**
 * Opens a synced email. Outlook web links only work for the mailbox owner, so
 * this looks for the message in the *viewer's* mailbox first and redirects to
 * Outlook. If the viewer wasn't on the email (a teammate's thread), it renders
 * the full message from the teammate's mailbox here instead.
 */
export async function GET(request: Request, { params }: Params) {
  const { id, activityId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const canView = await hasModulePermOrAdmin(admin, user.id, 'leads', 'can_view')
  if (!canView) return page('Not allowed', '', '<main>You don’t have permission to view leads.</main>', 403)

  const { data: act } = await admin
    .from('lead_activities')
    .select('email_message_id, email_subject, note, created_by, created_at')
    .eq('id', activityId)
    .eq('lead_id', id)
    .single()
  if (!act?.email_message_id) return page('Email not found', '', '<main>This entry isn’t a synced email.</main>', 404)

  const { data: people } = await admin.from('users').select('id, email').in('id', [user.id, act.created_by])
  const viewerEmail = people?.find(p => p.id === user.id)?.email
  const ownerEmail = people?.find(p => p.id === act.created_by)?.email

  try {
    if (isTeamMailbox(viewerEmail)) {
      const mine = await findMessage(viewerEmail!, act.email_message_id, 'webLink')
      if (mine?.webLink && isOutlookUrl(mine.webLink)) return NextResponse.redirect(mine.webLink)
    }

    const full = isTeamMailbox(ownerEmail)
      ? await findMessage(ownerEmail!, act.email_message_id, 'subject,from,toRecipients,ccRecipients,sentDateTime,body')
      : null
    if (full) return page(full.subject || '(no subject)', ...renderMessage(full))
  } catch {
    // Graph unreachable — fall through to the copy saved on the lead.
  }

  // Deleted from Outlook (or Outlook unreachable): show what BuildOS saved.
  return page(
    act.email_subject || '(no subject)',
    '<p class="meta">The original is no longer in Outlook — showing the copy saved on the lead.</p>',
    `<main><pre style="padding:0">${esc(act.note)}</pre></main>`,
  )
}

function isOutlookUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return /(^|\.)(outlook\.office365\.com|outlook\.office\.com|outlook\.live\.com)$/.test(host)
  } catch {
    return false
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function names(list?: FullMessage['toRecipients']): string {
  return (list ?? [])
    .map(a => a.emailAddress?.name && a.emailAddress.name !== a.emailAddress.address
      ? `${a.emailAddress.name} <${a.emailAddress.address}>`
      : a.emailAddress?.address ?? '')
    .filter(Boolean)
    .join(', ')
}

/** [header details, body frame] */
function renderMessage(m: FullMessage): [string, string] {
  const isHtml = m.body?.contentType?.toLowerCase() === 'html'
  const content = m.body?.content ?? ''
  // The email's own HTML goes in a sandboxed frame: no scripts, can't touch BuildOS.
  const doc = isHtml
    ? `<base target="_blank">${content}`
    : `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif">${esc(content)}</pre>`
  const when = m.sentDateTime
    ? new Date(m.sentDateTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })
    : ''
  return [`
    <dl class="meta">
      <dt>From</dt><dd>${esc(names(m.from ? [m.from] : []))}</dd>
      <dt>To</dt><dd>${esc(names(m.toRecipients))}</dd>
      ${m.ccRecipients?.length ? `<dt>Cc</dt><dd>${esc(names(m.ccRecipients))}</dd>` : ''}
      <dt>Sent</dt><dd>${esc(when)}</dd>
    </dl>`,
    `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(doc)}" title="Email"></iframe>`,
  ]
}

function page(title: string, header: string, main: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — BuildOS</title>
<style>
  body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#0f1f3d;background:#fff;display:flex;flex-direction:column;height:100vh}
  header{padding:16px;border-bottom:1px solid #e5e7eb}
  h1{font-size:18px;margin:0 0 8px}
  .meta{color:#6b7280;font-size:13px;margin:0}
  dl.meta{display:grid;grid-template-columns:auto 1fr;gap:2px 10px}
  dt{font-weight:600}dd{margin:0;word-break:break-word}
  iframe{flex:1;border:0;width:100%}
  pre{white-space:pre-wrap;padding:16px;margin:0;font:inherit}
  main{padding:16px}
</style></head><body>
<header><h1>${esc(title)}</h1>${header}</header>
${main}
</body></html>`
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'DENY',
    },
  })
}
