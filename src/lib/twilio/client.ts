import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Thin Twilio REST wrapper. Uses fetch against the Messages API rather than the
 * twilio npm package — the two calls we need (send, verify signature) are small
 * and the SDK pulls a large dependency tree into the Next.js server bundle.
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

/** (555) 123-4567 for display in the UI. Falls back to the raw value. */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const e164 = normalizePhone(raw)
  if (!e164) return raw ?? ''
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
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

/**
 * Verifies X-Twilio-Signature: HMAC-SHA1 of the full request URL with every POST
 * parameter appended in key order, keyed by the account auth token.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!AUTH_TOKEN || !signature) return false

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  const expected = createHmac('sha1', AUTH_TOKEN).update(Buffer.from(payload, 'utf-8')).digest('base64')

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The URL Twilio signed. Behind Vercel's proxy the incoming request URL can
 * differ from the public webhook URL, which breaks signature validation — set
 * TWILIO_WEBHOOK_URL to the exact URL configured in the Twilio console.
 */
export function webhookUrl(request: Request): string {
  const configured = process.env.TWILIO_WEBHOOK_URL
  if (configured) return configured
  return request.url
}
