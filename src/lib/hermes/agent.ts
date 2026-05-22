import { createAdminClient } from '@/lib/supabase/admin'

const WEBHOOK_URL = process.env.DISCORD_HERMES_WEBHOOK_URL ?? ''
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const CHANNEL_ID = process.env.DISCORD_HERMES_CHANNEL_ID ?? ''

export type HermesChannel = 'app' | 'discord'

export type HermesStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'navigate'; url: string; label?: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string }

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface DiscordMessage {
  id: string
  content: string
  author: { id: string; bot?: boolean }
  webhook_id?: string
}

// Cached at module level so we only fetch once per serverless instance
let hermesBotId: string | null = null

async function getHermesBotId(): Promise<string> {
  if (hermesBotId) return hermesBotId
  const resp = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  })
  const data = await resp.json() as { id: string }
  hermesBotId = data.id
  return hermesBotId
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function* hermesStream(
  userId: string,
  userMessage: string,
  conversationId: string | undefined,
  jobId: string | undefined
): AsyncGenerator<HermesStreamEvent> {
  const admin = createAdminClient()

  const { data: userRow } = await admin.from('users').select('full_name').eq('id', userId).single()
  const userName = (userRow as { full_name?: string } | null)?.full_name ?? 'Team Member'

  // Load or create conversation for UI history
  let convId = conversationId
  let history: StoredMessage[] = []

  if (convId) {
    const { data: conv } = await admin
      .from('hermes_conversations')
      .select('messages')
      .eq('id', convId)
      .eq('user_id', userId)
      .single()
    if (conv) history = (conv.messages as StoredMessage[]) ?? []
  } else {
    const { data: conv } = await admin
      .from('hermes_conversations')
      .insert({ user_id: userId, channel: 'app', messages: [] })
      .select('id')
      .single()
    convId = conv?.id
  }

  const botId = await getHermesBotId()

  // Include job context subtly if the user is on a specific job page
  const content = jobId
    ? `${userMessage} [job:${jobId}]`
    : userMessage

  // Post to Discord as the real user (webhook = no bot flag, appears as their name)
  const postResp = await fetch(`${WEBHOOK_URL}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userName, content }),
  })

  if (!postResp.ok) {
    yield { type: 'error', message: `Failed to reach Discord: ${postResp.status}` }
    return
  }

  const posted = await postResp.json() as { id: string }
  const afterId = posted.id

  // Poll the channel for Hermes's reply (bot message, not a webhook post)
  let reply = ''
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    await sleep(2000)

    const msgsResp = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?after=${afterId}&limit=20`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    )
    if (!msgsResp.ok) continue

    const msgs = await msgsResp.json() as DiscordMessage[]
    const hermesMsg = msgs
      .filter(m => m.author.id === botId && !m.webhook_id)
      .sort((a, b) => a.id.localeCompare(b.id))[0]

    if (hermesMsg) {
      reply = hermesMsg.content
      break
    }
  }

  if (!reply) {
    yield { type: 'error', message: 'Hermes did not respond in time. Try again.' }
    return
  }

  yield { type: 'delta', text: reply }

  // Persist for UI history
  const updatedHistory: StoredMessage[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
  ]
  if (convId) {
    await admin.from('hermes_conversations').update({ messages: updatedHistory }).eq('id', convId)
  }

  yield { type: 'done', conversationId: convId! }
}
