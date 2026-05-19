/**
 * Hermes AI Agent — STUB
 *
 * Phase 10 integration. The agent is not yet wired to Claude or Supabase.
 * All calls log to console and return a placeholder response.
 *
 * Phase 10a — implement:
 *   1. Build role-aware system prompt (inject: user name, role, active jobs, date, prior context)
 *   2. Define tool schemas gated by role tier (field / pm / owner) — see ROADMAP.md Phase 10a
 *   3. Call Claude API (claude-sonnet-4-6) with streaming
 *   4. On tool_use block, dispatch to /api/agent or direct Supabase queries
 *   5. Append message + tool_calls to hermes_conversations row
 *   6. On conversation end, summarise and upsert hermes_user_context
 *
 * Required env vars (not yet set):
 *   ANTHROPIC_API_KEY      — already used by /lib/ai/claude.ts
 *   TWILIO_ACCOUNT_SID     — Phase 10c, SMS interface
 *   TWILIO_AUTH_TOKEN      — Phase 10c
 *   TWILIO_PHONE_NUMBER    — Phase 10c
 */

export type HermesChannel = 'sms' | 'app'

export interface HermesMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  /** Tools Hermes called to answer this message — populated Phase 10a */
  tools_called?: string[]
}

export interface HermesChatResult {
  message: string
  /** Conversation row ID (for continuing the thread) */
  conversation_id?: string
}

export class HermesAgent {
  /**
   * Send a message to Hermes and receive a response.
   *
   * @param userId  — Supabase user UUID (used to load role + context)
   * @param message — The user's raw text message
   * @param channel — 'app' (in-app chat) or 'sms' (Twilio webhook)
   *
   * TODO (Phase 10a): implement
   *   1. Fetch user profile + role from public.users
   *   2. Fetch hermes_user_context for long-term memory
   *   3. Load last N messages from hermes_conversations for this user
   *   4. Build role-gated system prompt
   *   5. Stream Claude response with tool_use support
   *   6. Persist updated conversation to hermes_conversations
   *   7. Return final text response
   */
  async chat(
    userId: string,
    message: string,
    channel: HermesChannel = 'app'
  ): Promise<HermesChatResult> {
    // TODO (Phase 10a): implement full Claude-powered agent
    console.log('[Hermes stub] chat()', { userId, channel, messageLength: message.length })

    return {
      message:
        "Hermes isn't quite ready yet — this AI assistant is coming in Phase 10. " +
        'Once configured, you can ask about your tasks, daily logs, schedule, and more.',
    }
  }
}

/** Singleton for import convenience */
export const hermes = new HermesAgent()
