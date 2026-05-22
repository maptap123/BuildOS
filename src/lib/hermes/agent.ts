import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { HERMES_TOOLS, executeTool } from './tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  tools_called?: string[]
}

function buildSystemPrompt(userName: string, today: string, jobId?: string): string {
  return `You are Hermes, the AI assistant for JDC Construction LLC — a residential and commercial remodeling company based in Louisville, Kentucky.

Today is ${today}. The user's name is ${userName}.
${jobId ? `The user is currently viewing job ID: ${jobId}. Use this as the default job context when they refer to "this job", "the job", or "here".` : ''}

You have access to tools to read and update jobs, tasks, schedules, budgets, change orders, actuals, and daily logs. Use them to answer questions and take actions.

Rules:
- Always be concise and direct. Field crew are busy.
- When you look up data, present it clearly — use short lists, not paragraphs.
- Dollar amounts: always format as $X,XXX. Dates: format as "Mon DD" (e.g. "Jun 3").
- If you don't have permission to access something, say so simply.
- Never make up data. If unsure, look it up with a tool.
- Confirm before taking destructive actions (like changing a job status).
- When the user says "show me", "take me to", "open", or "go to" a section, use the navigate_to tool (look up the job ID first if needed) and give a one-line confirmation. Don't dump a data table — just navigate.`
}

async function postToDiscord(text: string, userName: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_HERMES_CHANNEL_ID
  if (!token || !channelId) return

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `**${userName}:** ${text}` }),
  }).catch(() => { /* fire-and-forget */ })
}

async function postHermesReplyToDiscord(text: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_HERMES_CHANNEL_ID
  if (!token || !channelId) return

  const MAX = 2000
  const chunks = []
  for (let i = 0; i < text.length; i += MAX) chunks.push(text.slice(i, i + MAX))

  for (const chunk of chunks) {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**Hermes:** ${chunk}` }),
    }).catch(() => { /* fire-and-forget */ })
  }
}

export async function* hermesStream(
  userId: string,
  userMessage: string,
  conversationId: string | undefined,
  jobId: string | undefined
): AsyncGenerator<HermesStreamEvent> {
  const admin = createAdminClient()

  // Load user info
  const { data: userRow } = await admin.from('users').select('full_name').eq('id', userId).single()
  const userName = (userRow as { full_name?: string } | null)?.full_name ?? 'Team Member'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  // Load or create conversation
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
  }

  if (!convId) {
    const { data: conv } = await admin
      .from('hermes_conversations')
      .insert({ user_id: userId, channel: 'app', messages: [] })
      .select('id')
      .single()
    convId = conv?.id
  }

  // Post user message to Discord (fire-and-forget)
  postToDiscord(userMessage, userName)

  // Build Claude messages from history
  const claudeMessages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role,
    content: m.content,
  }))
  claudeMessages.push({ role: 'user', content: userMessage })

  const systemPrompt = buildSystemPrompt(userName, today, jobId)

  // Agentic loop
  let fullReply = ''
  const toolsCalled: string[] = []

  try {
    while (true) {
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: HERMES_TOOLS,
        messages: claudeMessages,
      })

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullReply += event.delta.text
          yield { type: 'delta', text: event.delta.text }
        }
      }

      const finalMsg = await stream.finalMessage()

      if (finalMsg.stop_reason === 'tool_use') {
        const toolBlocks = finalMsg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        claudeMessages.push({ role: 'assistant', content: finalMsg.content })

        // Emit navigate events before executing other tools
        for (const block of toolBlocks) {
          if (block.name === 'navigate_to') {
            const input = block.input as { url: string; label?: string }
            yield { type: 'navigate', url: input.url, label: input.label }
          }
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async (block) => {
            toolsCalled.push(block.name)
            if (block.name === 'navigate_to') {
              return { type: 'tool_result' as const, tool_use_id: block.id, content: '{"success":true}' }
            }
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              userId,
              admin
            )
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            }
          })
        )

        claudeMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // end_turn
      break
    }

    // Persist conversation
    const updatedHistory: StoredMessage[] = [
      ...history,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: fullReply, timestamp: new Date().toISOString(), tools_called: toolsCalled.length ? toolsCalled : undefined },
    ]

    if (convId) {
      await admin.from('hermes_conversations').update({ messages: updatedHistory }).eq('id', convId)
    }

    // Post Hermes reply to Discord (awaited so Vercel doesn't kill it before it sends)
    if (fullReply) await postHermesReplyToDiscord(fullReply)

    yield { type: 'done', conversationId: convId! }

  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : 'Hermes encountered an error' }
  }
}
