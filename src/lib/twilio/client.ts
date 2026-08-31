/**
 * Thin Twilio REST wrapper for BuildOS-initiated texts (schedule invites,
 * reminders, calendar links).
 *
 * BuildOS only sends. Inbound SMS belongs to the Hermes/Fixer agent, which owns
 * the number's webhook and calls back into /api/agent to record what a sub
 * said — so there is no inbound handler or signature validation here.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? ''
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? ''
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID ?? ''

export function isTwilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SERVICE_SID))
}

/**
 * Normalizes a hand-entered US phone number to E.164 (+15551234567).
 * Returns null for anything that isn't a plausible number — callers treat that
 * as "no phone on file" rather than sending to a malformed destination.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export interface SendSmsResult {
  ok: boolean
  sid?: string
  error?: string
}

/**
 * Sends one SMS. Never throws — a messaging failure must not roll back the
 * assignment that triggered it, so the caller records the error instead.
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!isTwilioConfigured()) {
    return { ok: false, error: 'Twilio is not configured' }
  }

  const destination = normalizePhone(to)
  if (!destination) return { ok: false, error: 'Invalid phone number' }

  const form = new URLSearchParams({ To: destination, Body: body })
  if (MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', MESSAGING_SERVICE_SID)
  else form.set('From', FROM_NUMBER)

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        },
        body: form.toString(),
      }
    )

    const data = await res.json().catch(() => ({})) as { sid?: string; message?: string }
    if (!res.ok) return { ok: false, error: data.message ?? `Twilio ${res.status}` }
    return { ok: true, sid: data.sid }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
