import { createAdminClient } from '@/lib/supabase/admin'
import { postDiscordAlert } from './discord'

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

interface NotifyOptions {
  admin?: AdminClient
  userIds: string[]
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  discord?: boolean
}

// Writes one notification row per recipient and (optionally) posts a single summary
// message to Discord. Never throws — a failure here must not break the caller's request.
export async function notify({ admin, userIds, type, title, body, link, discord = true }: NotifyOptions): Promise<void> {
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

  if (discord) {
    const lines = [`**${title}**`]
    if (body) lines.push(body)
    if (link) lines.push(link.startsWith('http') ? link : `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${link}`)
    await postDiscordAlert(lines.join('\n'))
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
