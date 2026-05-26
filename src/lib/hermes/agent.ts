import { createAdminClient } from '@/lib/supabase/admin'

const WEBHOOK_URL = process.env.DISCORD_HERMES_WEBHOOK_URL ?? ''
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const CHANNEL_ID = process.env.DISCORD_HERMES_CHANNEL_ID ?? ''

const DISCORD_API = 'https://discord.com/api/v10'

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


async function getOrCreateThread(
  userId: string,
  userName: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  const { data: userRow } = await admin
    .from('users')
    .select('discord_thread_id')
    .eq('id', userId)
    .single()

  const existingThreadId = (userRow as { discord_thread_id?: string } | null)?.discord_thread_id
  if (existingThreadId) return existingThreadId

  // Post a starter message to anchor the thread
  const starterResp = await fetch(`${WEBHOOK_URL}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userName,
      content: `— ${userName} started a conversation with Hermes —`,
    }),
  })
  if (!starterResp.ok) throw new Error(`Webhook error: ${starterResp.status}`)
  const starter = await starterResp.json() as { id: string }

  // Create a thread from that message
  const threadResp = await fetch(
    `${DISCORD_API}/channels/${CHANNEL_ID}/messages/${starter.id}/threads`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${BOT_TOKEN}`,
      },
      body: JSON.stringify({
        name: `${userName} — Hermes`,
        auto_archive_duration: 10080,
      }),
    }
  )
  if (!threadResp.ok) throw new Error(`Thread creation error: ${threadResp.status}`)
  const thread = await threadResp.json() as { id: string }

  await admin.from('users').update({ discord_thread_id: thread.id }).eq('id', userId)
  return thread.id
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

  const { data: userRow } = await admin
    .from('users')
    .select('full_name')
    .eq('id', userId)
    .single()
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

  // Get or create this user's dedicated Discord thread
  let threadId: string
  try {
    threadId = await getOrCreateThread(userId, userName, admin)
  } catch (e) {
    yield { type: 'error', message: `Could not reach Discord: ${(e as Error).message}` }
    return
  }

  const content = jobId ? `${userMessage} [job:${jobId}]` : userMessage

  // Post to the user's thread as their real name
  const postResp = await fetch(`${WEBHOOK_URL}?wait=true&thread_id=${threadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userName, content }),
  })

  if (!postResp.ok) {
    yield { type: 'error', message: `Failed to reach Discord: ${postResp.status}` }
    return
  }

  const posted = await postResp.json() as { id: string }

  // Poll the thread for the bot's FINAL reply.
  // Hermes posts tool-call status messages (💻 terminal: "...", 🖥️ skill_view: "...")
  // before its real answer. We advance scanFrom past ALL bot messages but only treat
  // messages that look like prose answers as candidates.
  // A real answer: the first word (after stripping leading emoji/symbols) contains a
  // space before any colon — e.g. "Here you go:" not "terminal:".
  const looksLikeAnswer = (content: string) => {
    const text = content.trim()
    if (text.length < 15) return false
    const stripped = text.replace(/^[^A-Za-z]+/, '')       // skip leading emoji/symbols
    const beforeColon = stripped.split(':')[0]
    return /\s/.test(beforeColon) || !/:/.test(stripped)    // multi-word prefix or no colon
  }

  let reply = ''
  let lastRealMsg: DiscordMessage | null = null
  let scanFrom = posted.id
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    await sleep(2000)

    const msgsResp = await fetch(
      `${DISCORD_API}/channels/${threadId}/messages?after=${scanFrom}&limit=10`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    )
    if (!msgsResp.ok) continue

    const msgs = await msgsResp.json() as DiscordMessage[]
    if (!Array.isArray(msgs)) continue

    const allBotMsgs = msgs
      .filter(m => m.author.bot === true && !m.webhook_id && m.content.trim())
      .sort((a, b) => a.id.localeCompare(b.id))

    if (allBotMsgs.length > 0) {
      // Advance scanFrom past everything including tool-call messages
      scanFrom = allBotMsgs[allBotMsgs.length - 1].id
      const realMsgs = allBotMsgs.filter(m => looksLikeAnswer(m.content))
      if (realMsgs.length > 0) lastRealMsg = realMsgs[realMsgs.length - 1]
    } else if (lastRealMsg) {
      reply = lastRealMsg.content
      break
    }
  }

  if (!reply) {
    yield { type: 'error', message: 'Hermes did not respond in time. Try again.' }
    return
  }

  // Check for navigation queued by the navigate_to tool during this request
  const { data: userCtx } = await admin
    .from('hermes_user_context')
    .select('preferences')
    .eq('user_id', userId)
    .single()

  const ctxPrefs = (userCtx?.preferences as Record<string, unknown>) ?? {}
  let pendingNav = ctxPrefs.pending_nav as { url: string; label?: string } | undefined

  if (pendingNav?.url) {
    const clearedPrefs = { ...ctxPrefs }
    delete clearedPrefs.pending_nav
    await admin.from('hermes_user_context').upsert({
      user_id: userId,
      preferences: clearedPrefs,
      updated_at: new Date().toISOString(),
    })
  }

  // Fallback: if navigate_to wasn't called but reply contains a JDC platform URL,
  // extract the path and navigate there anyway
  if (!pendingNav?.url) {
    const urlMatch = reply.match(/https?:\/\/[^\s)]+\/(jobs\/[a-z0-9-/]+|finance|leads|time-clock[^\s)]*)/i)
    if (urlMatch) {
      const path = ('/' + urlMatch[1]).replace(/[)\].,;'"]+$/, '')
      pendingNav = { url: path }
    }
  }

  yield { type: 'delta', text: reply }
  if (pendingNav?.url) {
    yield { type: 'navigate', url: pendingNav.url, label: pendingNav.label }
  }

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
