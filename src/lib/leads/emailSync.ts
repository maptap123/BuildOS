/**
 * Lead email sync — pulls emails exchanged with a lead's client out of the
 * team's Outlook mailboxes (Microsoft Graph, app-only Mail.Read) and logs each
 * one on the lead timeline as an 'email' activity.
 *
 * Read-only: nothing is ever sent, moved or marked read. Only messages where
 * the client's address is the sender or a recipient are touched, so the rest
 * of a mailbox never leaves Outlook.
 *
 * Two entry points:
 *   - syncLeadEmails: one lead, via $search — runs when the lead page opens.
 *   - syncRecentLeadEmails: every lead, via a received-date window — the
 *     daily cron, which catches leads nobody opened.
 *
 * Dedupe is the RFC 822 Message-ID (unique per lead), so the same email found
 * in two teammates' mailboxes or by both entry points is logged once.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { graphFetch, isGraphConfigured } from '@/lib/integrations/microsoft/graphClient'
import type { LeadActivity } from '@/types'

type Admin = ReturnType<typeof createAdminClient>

/** Mailboxes on these domains are synced. A user signed in with a Gmail address has no Outlook mailbox to read. */
const MAILBOX_DOMAINS = (process.env.LEAD_EMAIL_SYNC_DOMAINS ?? 'jdcremodeling.com')
  .split(',').map(d => d.trim().toLowerCase()).filter(Boolean)

/** Emails older than this before the lead was created belong to an earlier job, not this lead. */
const LOOKBACK_BEFORE_LEAD_MS = 30 * 24 * 60 * 60 * 1000
const MAX_NOTE_CHARS = 4000

const SELECT = [
  'internetMessageId', 'subject', 'from', 'toRecipients', 'ccRecipients',
  'sentDateTime', 'receivedDateTime', 'isDraft', 'uniqueBody', 'bodyPreview',
].join(',')

interface GraphAddress { emailAddress?: { address?: string; name?: string } }
interface GraphMessage {
  internetMessageId?: string
  subject?: string | null
  from?: GraphAddress
  toRecipients?: GraphAddress[]
  ccRecipients?: GraphAddress[]
  sentDateTime?: string
  receivedDateTime?: string
  isDraft?: boolean
  uniqueBody?: { content?: string }
  bodyPreview?: string
}

interface Mailbox { address: string; userId: string }
interface SyncLead { id: string; client_email: string | null; created_at: string }

export interface SyncResult {
  added: LeadActivity[]
  /** Set when the sync couldn't run at all (not configured, permission missing). */
  error?: string
}

export function leadAddresses(clientEmail: string | null): string[] {
  return (clientEmail ?? '')
    .split(/[,;\s]+/)
    .map(a => a.trim().toLowerCase())
    .filter(a => a.includes('@'))
}

const addr = (a?: GraphAddress) => a?.emailAddress?.address?.toLowerCase() ?? ''

async function listMailboxes(admin: Admin): Promise<Mailbox[]> {
  const { data } = await admin.from('users').select('id, email').eq('is_active', true)
  return (data ?? [])
    .filter(u => u.email && MAILBOX_DOMAINS.includes(u.email.split('@')[1]?.toLowerCase()))
    .map(u => ({ address: u.email.toLowerCase(), userId: u.id }))
}

/** Graph GET that follows @odata.nextLink up to `maxPages`. Throws with a readable message. */
async function graphList(path: string, maxPages: number): Promise<GraphMessage[]> {
  const out: GraphMessage[] = []
  let next: string | undefined = path
  for (let page = 0; next && page < maxPages; page++) {
    const res = await graphFetch(next, { headers: { Prefer: 'outlook.body-content-type="text"' } })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      const err = new Error(body.error?.message ?? `Graph ${res.status}`) as Error & { status?: number; code?: string }
      err.status = res.status
      err.code = body.error?.code
      throw err
    }
    const json = await res.json() as { value?: GraphMessage[]; '@odata.nextLink'?: string }
    out.push(...(json.value ?? []))
    next = json['@odata.nextLink']
  }
  return out
}

/** A mailbox that isn't on Exchange Online (or was deleted) — skip it, don't fail the sync. */
function isMissingMailbox(e: unknown): boolean {
  const err = e as { status?: number; code?: string }
  return err.status === 404 || err.code === 'MailboxNotEnabledForRESTAPI' || err.code === 'ResourceNotFound'
}

function describeGraphError(e: unknown): string {
  const err = e as { status?: number; message?: string }
  if (err.status === 401 || err.status === 403) {
    return 'Outlook access not granted — the Microsoft app needs the Mail.Read application permission (with admin consent).'
  }
  return err.message ?? 'Outlook sync failed'
}

/** Keeps the new part of the message: drops quoted replies and squeezes blank runs. */
function cleanBody(msg: GraphMessage): string {
  let text = msg.uniqueBody?.content ?? msg.bodyPreview ?? ''
  const cut = text.search(/^(On .+wrote:|From: .+|-{3,} ?Original Message ?-{3,}|_{10,})\s*$/m)
  if (cut > 0) text = text.slice(0, cut)
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > MAX_NOTE_CHARS ? `${text.slice(0, MAX_NOTE_CHARS).trimEnd()}…` : text
}

function toRow(msg: GraphMessage, lead: SyncLead, clientAddrs: string[], owner: Mailbox) {
  const from = addr(msg.from)
  const direction = clientAddrs.includes(from) ? 'received' : 'sent'
  const to = [...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])].map(addr).filter(Boolean)
  return {
    lead_id: lead.id,
    kind: 'email' as const,
    note: cleanBody(msg) || '(no message text)',
    created_by: owner.userId,
    created_at: (direction === 'sent' ? msg.sentDateTime : msg.receivedDateTime) ?? msg.receivedDateTime ?? new Date().toISOString(),
    email_message_id: msg.internetMessageId!,
    email_direction: direction,
    email_subject: msg.subject?.trim() || null,
    email_from: from || null,
    email_to: to.join(', ') || null,
  }
}

/** True when the message involves one of the client's addresses and falls in the lead's window. */
function belongsToLead(msg: GraphMessage, lead: SyncLead, clientAddrs: string[]): boolean {
  if (msg.isDraft || !msg.internetMessageId) return false
  const people = [msg.from, ...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])].map(addr)
  if (!people.some(p => clientAddrs.includes(p))) return false
  const when = Date.parse(msg.sentDateTime ?? msg.receivedDateTime ?? '')
  return !Number.isFinite(when) || when >= Date.parse(lead.created_at) - LOOKBACK_BEFORE_LEAD_MS
}

type Row = ReturnType<typeof toRow>

/** Inserts rows that aren't already logged or dismissed. Returns what was actually added. */
async function insertRows(admin: Admin, rows: Row[]): Promise<LeadActivity[]> {
  if (rows.length === 0) return []
  const unique = new Map(rows.map(r => [`${r.lead_id}|${r.email_message_id}`, r]))
  const leadIds = [...new Set(rows.map(r => r.lead_id))]

  const { data: dismissed } = await admin
    .from('lead_email_dismissals')
    .select('lead_id, email_message_id')
    .in('lead_id', leadIds)
  for (const d of dismissed ?? []) unique.delete(`${d.lead_id}|${d.email_message_id}`)
  if (unique.size === 0) return []

  const { data, error } = await admin
    .from('lead_activities')
    .upsert([...unique.values()], { onConflict: 'lead_id,email_message_id', ignoreDuplicates: true })
    .select()
  if (error) throw new Error(error.message)
  return (data ?? []) as LeadActivity[]
}

/** Syncs one lead by searching every team mailbox for its client's address. */
export async function syncLeadEmails(admin: Admin, lead: SyncLead): Promise<SyncResult> {
  const clientAddrs = leadAddresses(lead.client_email)
  if (clientAddrs.length === 0) return { added: [] }
  if (!isGraphConfigured()) return { added: [], error: 'Microsoft Graph is not configured' }

  const mailboxes = await listMailboxes(admin)
  const rows: Row[] = []

  try {
    for (const owner of mailboxes) {
      for (const client of clientAddrs) {
        // KQL participants: covers from, to and cc across every folder, Sent Items included.
        const search = encodeURIComponent(`"participants:${client}"`)
        let messages: GraphMessage[]
        try {
          messages = await graphList(
            `/users/${encodeURIComponent(owner.address)}/messages?$search=${search}&$select=${SELECT}&$top=50`,
            2,
          )
        } catch (e) {
          if (isMissingMailbox(e)) break
          throw e
        }
        for (const msg of messages) {
          if (belongsToLead(msg, lead, clientAddrs)) rows.push(toRow(msg, lead, clientAddrs, owner))
        }
      }
    }
  } catch (e) {
    return { added: [], error: describeGraphError(e) }
  }

  const added = await insertRows(admin, rows)
  await admin.from('leads').update({ emails_synced_at: new Date().toISOString() }).eq('id', lead.id)
  return { added }
}

/**
 * Syncs every lead from mail received or sent in the last `days` days. One
 * paged listing per mailbox, matched to leads in memory — far cheaper than a
 * search per lead.
 */
export async function syncRecentLeadEmails(admin: Admin, days = 2): Promise<{ added: number; mailboxes: number; error?: string }> {
  if (!isGraphConfigured()) return { added: 0, mailboxes: 0, error: 'Microsoft Graph is not configured' }

  const { data: leads, error: leadsErr } = await admin
    .from('leads')
    .select('id, client_email, created_at')
    .not('client_email', 'is', null)
  if (leadsErr) return { added: 0, mailboxes: 0, error: leadsErr.message }

  const byAddress = new Map<string, SyncLead[]>()
  for (const lead of leads ?? []) {
    for (const a of leadAddresses(lead.client_email)) {
      byAddress.set(a, [...(byAddress.get(a) ?? []), lead])
    }
  }
  if (byAddress.size === 0) return { added: 0, mailboxes: 0 }

  const mailboxes = await listMailboxes(admin)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const rows: Row[] = []

  try {
    for (const owner of mailboxes) {
      let messages: GraphMessage[]
      try {
        messages = await graphList(
          `/users/${encodeURIComponent(owner.address)}/messages?$filter=receivedDateTime ge ${since}&$select=${SELECT}&$top=100`,
          20,
        )
      } catch (e) {
        if (isMissingMailbox(e)) continue
        throw e
      }
      for (const msg of messages) {
        const people = new Set([msg.from, ...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])].map(addr))
        const leadsHit = new Set<SyncLead>()
        for (const p of people) for (const l of byAddress.get(p) ?? []) leadsHit.add(l)
        for (const lead of leadsHit) {
          const clientAddrs = leadAddresses(lead.client_email)
          if (belongsToLead(msg, lead, clientAddrs)) rows.push(toRow(msg, lead, clientAddrs, owner))
        }
      }
    }
  } catch (e) {
    return { added: 0, mailboxes: mailboxes.length, error: describeGraphError(e) }
  }

  const added = await insertRows(admin, rows)
  return { added: added.length, mailboxes: mailboxes.length }
}
