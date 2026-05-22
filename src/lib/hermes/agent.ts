import { createAdminClient } from '@/lib/supabase/admin'

const HERMES_BASE_URL = (process.env.HERMES_API_URL ?? '').replace(/\/$/, '')
const HERMES_API_KEY = process.env.HERMES_API_KEY ?? ''

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

async function postToDiscord(text: string, userName: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_HERMES_CHANNEL_ID
  if (!token || !channelId) return
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `**${userName}:** ${text}` }),
  }).catch(() => {})
}

async function postHermesReplyToDiscord(text: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_HERMES_CHANNEL_ID
  if (!token || !channelId) return
  const MAX = 2000
  for (let i = 0; i < text.length; i += MAX) {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**Hermes:** ${text.slice(i, i + MAX)}` }),
    }).catch(() => {})
  }
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
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

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

  // Mirror user message to Discord
  postToDiscord(userMessage, userName)

  const systemContext = [
    `You are Hermes, the AI assistant for JDC Construction LLC — a residential and commercial remodeling company in Louisville, Kentucky.`,
    `Today is ${today}. The user's name is ${userName} (user ID: ${userId}).`,
    jobId ? `They are currently viewing job ID: ${jobId}. Use this as the default job context.` : '',
    `Be concise and direct. Field crew are busy. Format dollar amounts as $X,XXX and dates as "Mon DD".`,
  ].filter(Boolean).join(' ')

  const messages = [
    { role: 'system' as const, content: systemContext },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const response = await fetch(`${HERMES_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HERMES_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      yield { type: 'error', message: `Hermes API error ${response.status}: ${errText}` }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', message: 'No response body from Hermes' }
      return
    }

    const decoder = new TextDecoder()
    let fullReply = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const chunk = JSON.parse(data)
          const text = chunk.choices?.[0]?.delta?.content
          if (text) {
            fullReply += text
            yield { type: 'delta', text }
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    const updatedHistory: StoredMessage[] = [
      ...history,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: fullReply, timestamp: new Date().toISOString() },
    ]

    if (convId) {
      await admin.from('hermes_conversations').update({ messages: updatedHistory }).eq('id', convId)
    }

    if (fullReply) await postHermesReplyToDiscord(fullReply)

    yield { type: 'done', conversationId: convId! }

  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : 'Hermes encountered an error' }
  }
}
