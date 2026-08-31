import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateRange, jobAddress, type AssignmentContext } from './assignments'

type AdminClient = ReturnType<typeof createAdminClient>

export type SmsIntent = 'confirm' | 'decline' | 'question' | 'reschedule' | 'stop' | 'unclear'

export interface FixerSmsReply {
  intent: SmsIntent
  /** What to text back. Empty means send nothing (carrier handles opt-out). */
  reply: string
  /** True when a human on the JDC side needs to pick this up. */
  escalate: boolean
}

// A plain "yes"/"no" is the overwhelmingly common reply. Answering it without a
// model round-trip keeps the confirmation instant and cannot be misread.
const CONFIRM_RE = /^[\s.!,]*(y|ya|yes+|yep|yup|yeah|yessir|confirm(ed)?|ok|okay|k|sure|sounds good|works|10-?4|copy( that)?|will do|i'?m in|affirmative|👍|✅|👌)[\s.!,]*$/i
const DECLINE_RE = /^[\s.!,]*(n|no+|nope|nah|can'?t|cannot|can not|decline[d]?|negative|not available|unavailable|no good|won'?t work|❌|👎)[\s.!,]*$/i
const STOP_RE = /^[\s.!,]*(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout|opt out)[\s.!,]*$/i

const MAX_SMS_CHARS = 320 // two SMS segments — long enough to be useful, short enough to read

const SYSTEM_PROMPT = `You are Fixer, the assistant for JDC Construction. You are texting a subcontractor or crew member about ONE scheduled appointment they were just assigned.

Your job:
1. Work out what their text means: confirming, declining, asking a question, asking to move the date, or unclear.
2. Write a short SMS reply back.

Rules for the reply:
- Plain text SMS. Under 300 characters. No markdown, no emoji, no signature block.
- Sound like a helpful person at a construction company, not a chatbot. Short sentences.
- Answer questions ONLY from the appointment facts you are given. Never invent an address, a time, a scope detail, a pay rate, or a contact name.
- If you do not have the fact they asked for, say you will check with the team and get right back to them, and set escalate to true.
- Never agree to change a date, change scope, or discuss money or payment. Say you will pass it to the project manager and set escalate to true.
- If they confirm, thank them briefly and tell them a calendar link is coming.
- If they decline, acknowledge it and say the team will follow up. Do not push back or ask them to reconsider.
- If they are still holding a question after confirming, answer it and keep the confirmation.

Set escalate to true whenever a person at JDC needs to act: reschedule requests, scope or money questions, complaints, anything you could not answer from the facts, or anything ambiguous enough that a wrong answer would matter.`

function buildFactSheet(ctx: AssignmentContext): string {
  const { item, job, assignment } = ctx
  return [
    `Person texting: ${assignment.contact_name}`,
    `Work: ${item.title}`,
    item.trade ? `Trade: ${item.trade}` : null,
    `Dates: ${formatDateRange(item.start_date, item.end_date)} (${item.start_date} to ${item.end_date}, all day)`,
    `Job: ${job.job_number} - ${job.name}`,
    `Site address: ${jobAddress(job)}`,
    item.description ? `Notes on this phase: ${item.description}` : null,
    `Their current status: ${assignment.status}`,
    'Facts you do NOT have (say you will check with the team if asked): arrival time of day, gate/lockbox codes, who else is on site, pay or invoice terms, material supply, parking.',
  ]
    .filter(Boolean)
    .join('\n')
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['confirm', 'decline', 'question', 'reschedule', 'unclear'],
      description: 'What the subcontractor’s message means.',
    },
    reply: {
      type: 'string',
      description: 'The SMS to text back. Plain text, under 300 characters.',
    },
    escalate: {
      type: 'boolean',
      description: 'True when someone at JDC needs to follow up personally.',
    },
  },
  required: ['intent', 'reply', 'escalate'],
  additionalProperties: false,
} as const

async function recentTranscript(
  admin: AdminClient,
  assignmentId: string
): Promise<Anthropic.MessageParam[]> {
  const { data } = await admin
    .from('schedule_assignment_messages')
    .select('direction, body')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .limit(10)

  const rows = ((data ?? []) as { direction: string; body: string }[]).reverse()
  return rows.map(row => ({
    role: row.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: row.body,
  }))
}

/**
 * Decides what an inbound text means and what to say back.
 *
 * Falls back to escalating rather than guessing whenever the model is
 * unavailable or refuses — a sub left without an answer is recoverable, a
 * wrong commitment texted in JDC's name is not.
 */
export async function interpretInboundSms(
  admin: AdminClient,
  ctx: AssignmentContext,
  inboundBody: string
): Promise<FixerSmsReply> {
  const text = inboundBody.trim()

  if (STOP_RE.test(text)) {
    return { intent: 'stop', reply: '', escalate: true }
  }
  if (CONFIRM_RE.test(text)) {
    return { intent: 'confirm', reply: '', escalate: false }
  }
  if (DECLINE_RE.test(text)) {
    return { intent: 'decline', reply: '', escalate: false }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      intent: 'unclear',
      reply: "Thanks — I've passed this to the JDC team and someone will get back to you shortly.",
      escalate: true,
    }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const history = await recentTranscript(admin, ctx.assignment.id)

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4096,
      system: `${SYSTEM_PROMPT}\n\nAppointment facts:\n${buildFactSheet(ctx)}`,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      messages: [...history, { role: 'user', content: text }],
    })

    if (response.stop_reason === 'refusal') {
      return {
        intent: 'unclear',
        reply: "Thanks — I've passed this to the JDC team and someone will get back to you shortly.",
        escalate: true,
      }
    }

    const block = response.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('No text block in response')

    const parsed = JSON.parse(block.text) as FixerSmsReply
    return {
      intent: parsed.intent ?? 'unclear',
      reply: (parsed.reply ?? '').slice(0, MAX_SMS_CHARS),
      escalate: Boolean(parsed.escalate),
    }
  } catch (e) {
    console.error('[fixer-sms] interpretation failed', e)
    return {
      intent: 'unclear',
      reply: "Thanks — I've passed this to the JDC team and someone will get back to you shortly.",
      escalate: true,
    }
  }
}
