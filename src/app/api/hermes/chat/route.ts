import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
// TODO (Phase 10a): import { hermes } from '@/lib/hermes/agent'
// TODO (Phase 10a): Wire streaming — replace NextResponse.json with a ReadableStream response

/**
 * POST /api/hermes/chat
 *
 * Hermes in-app chat endpoint. Accepts a user message and returns an
 * AI response. Designed to be streaming-ready (Phase 10b).
 *
 * Request body:
 *   {
 *     message:          string,           // user's text message
 *     conversation_id?: string,           // existing thread UUID, or omit to start new
 *   }
 *
 * Response (once implemented):
 *   Streaming: text/event-stream with Server-Sent Events
 *   Each event: data: { delta: string }
 *   Final event: data: { done: true, conversation_id: string }
 *
 * Phase 10a implementation plan:
 *   1. Auth + permission check (all authenticated users)
 *   2. Load/create hermes_conversations row
 *   3. Call hermes.chat(user.id, message, 'app')
 *   4. Stream Claude response back via ReadableStream
 *   5. On stream end, persist full message to DB
 *
 * Phase 10b additions:
 *   - Context awareness: accept optional `job_id` to pre-set active job
 *   - Quick-action chips: accept `action` shortcut instead of `message`
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { message } = body as { message?: string; conversation_id?: string }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // TODO (Phase 10a): call hermes.chat(user.id, message.trim(), 'app') and stream the response
  return NextResponse.json(
    {
      error: 'Hermes not yet configured',
      note: 'Phase 10: Implement HermesAgent.chat() and wire Claude streaming to this route.',
    },
    { status: 501 }
  )
}
