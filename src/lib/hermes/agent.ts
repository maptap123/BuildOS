import { createAdminClient } from '@/lib/supabase/admin'
import { askFixer } from './fixerApi'

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

export async function* hermesStream(
  userId: string,
  userMessage: string,
  conversationId: string | undefined,
  jobId: string | undefined
): AsyncGenerator<HermesStreamEvent> {
  const admin = createAdminClient()

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

  const content = jobId ? `${userMessage} [job:${jobId}]` : userMessage

  let reply: string
  try {
    reply = await askFixer(
      content,
      history.map(m => ({ role: m.role, content: m.content })),
    )
  } catch (e) {
    yield { type: 'error', message: (e as Error).message }
    return
  }

  yield* finishTurn(admin, userId, convId!, userMessage, reply, history)
}

/**
 * Everything after the answer arrives: surface any queued navigation, emit the
 * reply, and store the turn.
 */
async function* finishTurn(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  convId: string,
  userMessage: string,
  reply: string,
  history: StoredMessage[]
): AsyncGenerator<HermesStreamEvent> {
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

  yield { type: 'done', conversationId: convId }
}
