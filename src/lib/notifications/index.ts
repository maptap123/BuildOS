import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio/client'
import { absoluteUrl } from '@/lib/appUrl'

type AdminClient = ReturnType<typeof createAdminClient>

export type NotificationType =
  | 'proposal_accepted'
  | 'proposal_declined'
  | 'co_signed'
  | 'co_rejected'
  | 'lead_created'
  | 'task_assigned'
  | 'task_blocked'
  | 'log_missing'
  | 'schedule_confirmed'
  | 'schedule_declined'
  | 'schedule_question'

/**
 * Types that get a text as well as the in-app bell: something is stuck and the
 * office needs to act today, not whenever they next open BuildOS. Everything
 * else waits in the notification list.
 */
const URGENT_TYPES = new Set<NotificationType>([
  'schedule_question',  // a sub asked something Fixer wouldn't answer
  'schedule_declined',  // a sub dropped off a phase — the day needs re-covering
  'task_blocked',
  'co_rejected',
])

interface NotifyOptions {
  admin?: AdminClient
  userIds: string[]
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  /** Overrides the per-type default for whether recipients also get a text. */
  urgent?: boolean
}

// Writes one notification row per recipient, and texts the urgent ones. Never
// throws — a failure here must not break the caller's request.
export async function notify({ admin, userIds, type, title, body, link, urgent }: NotifyOptions): Promise<void> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return

  const client = admin ?? createAdminClient()

  try {
    const { error } = await client.from('notifications').insert(
      ids.map((user_id) => ({
        user_id,
        type,
        title,
        body: body ?? null,
        link: link ?? null,
      })),
    )
    if (error) console.error('[notifications] insert failed', error)
  } catch (err) {
    console.error('[notifications] insert threw', err)
  }

  if (urgent ?? URGENT_TYPES.has(type)) {
    await textRecipients(client, ids, { title, body, link })
  }
}

/**
 * Texts each recipient who has a mobile number on file. Silently skips anyone
 * without one — a missing phone is a data gap, not a reason to fail the request
 * that triggered the alert.
 */
async function textRecipients(
  client: AdminClient,
  userIds: string[],
  alert: { title: string; body?: string | null; link?: string | null },
): Promise<void> {
  try {
    const { data: recipients } = await client
      .from('users')
      .select('id, phone')
      .in('id', userIds)
      .eq('is_active', true)

    const withPhones = (recipients ?? []).filter(
      (r): r is { id: string; phone: string } => Boolean(r.phone?.trim()),
    )
    if (withPhones.length === 0) return

    const link = alert.link ? absoluteUrl(alert.link) : ''
    const message = [`JDC: ${alert.title}`, alert.body, link]
      .filter(Boolean)
      .join('\n')
      .slice(0, 320)

    await Promise.all(
      withPhones.map(async (r) => {
        const result = await sendSms(r.phone, message)
        if (!result.ok) console.error(`[notifications] alert text to ${r.id} failed: ${result.error}`)
      }),
    )
  } catch (err) {
    console.error('[notifications] alert texts threw', err)
  }
}

// Every active user with admin-level access (user_permissions.admin.can_manage) —
// the office-facing default audience for proposal/CO/lead/blocked-task alerts.
export async function getAdminUserIds(admin?: AdminClient): Promise<string[]> {
  const client = admin ?? createAdminClient()

  const { data, error } = await client
    .from('user_permissions')
    .select('user_id, users!inner(is_active)')
    .eq('module', 'admin')
    .eq('can_manage', true)
    .eq('users.is_active', true)

  if (error) {
    console.error('[notifications] getAdminUserIds failed', error)
    return []
  }

  return (data ?? []).map((row) => row.user_id as string)
}

// Job's PM if set, else falls back to the full admin group so nothing goes unseen.
export async function getJobNotifyTargets(jobId: string, admin?: AdminClient): Promise<string[]> {
  const client = admin ?? createAdminClient()

  const { data: job } = await client
    .from('jobs')
    .select('project_manager_id')
    .eq('id', jobId)
    .single()

  const pmId = (job as { project_manager_id?: string | null } | null)?.project_manager_id
  if (pmId) return [pmId]

  return getAdminUserIds(client)
}
