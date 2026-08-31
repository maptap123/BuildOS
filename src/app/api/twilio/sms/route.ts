import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postDiscordAlert } from '@/lib/notifications/discord'
import { normalizePhone, validateTwilioSignature, webhookUrl } from '@/lib/twilio/client'
import {
  buildConfirmedMessage,
  buildDeclinedMessage,
  confirmPageUrl,
  flagForHuman,
  loadAssignmentByPhone,
  logMessage,
  recordResponse,
  sendAssignmentSms,
} from '@/lib/schedule/assignments'
import { interpretInboundSms } from '@/lib/schedule/fixerSms'

// The AI turn plus the outbound send run in after(), past the response — give
// the invocation room to finish them.
export const maxDuration = 60

/** Twilio expects TwiML. An empty <Response/> means "no auto-reply from this webhook". */
function twiml(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

/**
 * POST /api/twilio/sms — inbound SMS webhook.
 *
 * Twilio times out at 15s, and Fixer's reply needs a model call, so the webhook
 * answers immediately with empty TwiML and does the real work in after(),
 * sending the reply through the REST API. Every message that way lands in the
 * assignment transcript with its Twilio SID.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>

  if (!validateTwilioSignature(webhookUrl(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const fromNumber = normalizePhone(params.From)
  const toNumber = params.To ?? null
  const messageBody = (params.Body ?? '').trim()
  const messageSid = params.MessageSid || params.SmsMessageSid || null

  if (!fromNumber || !messageBody) return twiml()

  const admin = createAdminClient()
  const ctx = await loadAssignmentByPhone(admin, fromNumber)

  if (!ctx) {
    // Someone texted the JDC line who has no open schedule request — a wrong
    // number, or a sub replying from a second phone. Never auto-reply to an
    // unknown number; put it in front of a human instead.
    after(() =>
      postDiscordAlert(
        `**Unmatched SMS to the JDC line**\nFrom: ${fromNumber}\n> ${messageBody.slice(0, 500)}`
      )
    )
    return twiml()
  }

  // Twilio retries a webhook it thinks failed. The unique index on twilio_sid
  // makes the insert the idempotency check: a duplicate SID means we already
  // handled this text.
  const { error: logError } = await admin.from('schedule_assignment_messages').insert({
    assignment_id: ctx.assignment.id,
    direction: 'inbound',
    body: messageBody,
    from_number: fromNumber,
    to_number: toNumber,
    twilio_sid: messageSid,
  })
  if (logError) {
    if (logError.code === '23505') return twiml()
    console.error('[twilio-sms] inbound log failed', logError)
  }

  await admin
    .from('schedule_assignments')
    .update({ last_inbound_at: new Date().toISOString() })
    .eq('id', ctx.assignment.id)

  after(async () => {
    try {
      const result = await interpretInboundSms(admin, ctx, messageBody)

      if (messageSid) {
        await admin
          .from('schedule_assignment_messages')
          .update({ intent: result.intent })
          .eq('twilio_sid', messageSid)
      }

      if (result.intent === 'stop') {
        // Twilio handles carrier opt-out itself; never text back after STOP.
        await flagForHuman(admin, ctx, 'Opted out of texts (STOP)')
        return
      }

      if (result.intent === 'confirm') {
        const updated = await recordResponse(admin, ctx, 'confirmed', {
          note: result.reply ? messageBody : null,
          source: 'sms',
        })
        const link = confirmPageUrl(updated.assignment.token)
        const reply = result.reply
          ? [result.reply, ...(link ? ['', `Add it to your calendar: ${link}`] : [])].join('\n')
          : buildConfirmedMessage(updated)
        await sendAssignmentSms(admin, updated, reply, { aiGenerated: Boolean(result.reply) })
        if (result.escalate) await flagForHuman(admin, updated, messageBody)
        return
      }

      if (result.intent === 'decline') {
        const updated = await recordResponse(admin, ctx, 'declined', {
          note: messageBody,
          source: 'sms',
        })
        await sendAssignmentSms(admin, updated, result.reply || buildDeclinedMessage(updated), {
          aiGenerated: Boolean(result.reply),
        })
        return
      }

      // Question, reschedule request, or unclear — answer if Fixer can, and pull
      // in a human whenever it decided it shouldn't be the one answering.
      if (result.reply) {
        await sendAssignmentSms(admin, ctx, result.reply, { aiGenerated: true })
      }
      if (result.escalate || result.intent === 'reschedule') {
        await flagForHuman(admin, ctx, messageBody)
      }
    } catch (e) {
      console.error('[twilio-sms] processing failed', e)
      await logMessage(admin, {
        assignmentId: ctx.assignment.id,
        direction: 'outbound',
        body: `[Fixer could not process this reply: ${e instanceof Error ? e.message : 'unknown error'}]`,
      })
      await flagForHuman(admin, ctx, messageBody)
    }
  })

  return twiml()
}
