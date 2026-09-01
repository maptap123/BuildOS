/**
 * Thin Resend REST wrapper for BuildOS-initiated email (account invites).
 *
 * Supabase's built-in mailer sends as "Supabase Auth <noreply@mail.app.supabase.io>"
 * and is capped at a couple of messages an hour — fine for a demo, wrong for
 * onboarding a crew. When RESEND_API_KEY is set, BuildOS composes and sends the
 * mail itself from JDC's own domain and Supabase only mints the token.
 *
 * Unconfigured is a supported state, not an error: callers fall back to the
 * Supabase mailer so invites keep working before the sending domain is verified.
 */

const API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM = process.env.EMAIL_FROM ?? 'BuildOS — JDC Construction <noreply@jdcremodeling.com>'
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? ''

export function isEmailConfigured(): boolean {
  return Boolean(API_KEY)
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  /** Plain-text alternative. Without one, spam filters score the message worse. */
  text: string
}

/**
 * Sends one email. Never throws — a delivery failure must not lose the account
 * that was just created, so the caller reports the error and offers the link.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: 'Email is not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        text,
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }),
    })

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (!res.ok) return { ok: false, error: data.message ?? `Resend ${res.status}` }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
