/**
 * The BuildOS account invitation email.
 *
 * Table-based layout with inline styles on purpose: Gmail strips <style> blocks
 * on mobile and Outlook ignores most modern CSS, so anything structural has to
 * live in table cells and style attributes to survive.
 */

export interface InviteEmailInput {
  /** Invitee's name, when the admin supplied one. */
  fullName?: string | null
  /** Name of the person who sent the invite, e.g. "Jason Cox". */
  invitedBy?: string | null
  /** One-time accept link on the BuildOS domain. */
  acceptUrl: string
  /** How long the link stays good, e.g. "24 hours". */
  expiresIn: string
}

const NAVY = '#1b2b4a'
const NAVY_DARK = '#0b1623'
const GOLD = '#c09030'
const GOLD_LIGHT = '#d4a83c'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function inviteEmailSubject(): string {
  return "You're invited to BuildOS — JDC Construction"
}

export function inviteEmailText({ fullName, invitedBy, acceptUrl, expiresIn }: InviteEmailInput): string {
  const greeting = fullName?.trim() ? `Hi ${fullName.trim()},` : 'Hi,'
  const from = invitedBy?.trim() ? `${invitedBy.trim()} has set up` : 'You have'
  return [
    'BUILDOS — JDC CONSTRUCTION',
    '',
    greeting,
    '',
    `${from} a BuildOS account for you. BuildOS is where JDC runs jobs, schedules,`,
    'daily logs, time clock, and budgets.',
    '',
    'Set your password to finish setting up your account:',
    acceptUrl,
    '',
    `This link is good for ${expiresIn} and can only be used once. If it stops working,`,
    'ask the office to send a new invite.',
    '',
    'JDC Construction LLC — internal use only.',
    "If you weren't expecting this, you can ignore this email.",
  ].join('\n')
}

export function inviteEmailHtml({ fullName, invitedBy, acceptUrl, expiresIn }: InviteEmailInput): string {
  const greeting = fullName?.trim() ? `Hi ${escapeHtml(fullName.trim())},` : 'Hi,'
  const from = invitedBy?.trim()
    ? `<strong>${escapeHtml(invitedBy.trim())}</strong> has set up`
    : 'You have'
  const url = escapeHtml(acceptUrl)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>You're invited to BuildOS</title>
</head>
<body style="margin:0; padding:0; background-color:#eef3fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">Set your password and get into BuildOS — JDC Construction.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3fb; padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(11,22,35,0.08);">

          <tr>
            <td align="center" style="background-color:${NAVY}; padding:32px 24px 28px 24px;">
              <div style="font-size:30px; line-height:34px; font-weight:700; color:#ffffff; letter-spacing:0.5px;">BuildOS</div>
              <div style="font-size:11px; line-height:16px; font-weight:600; color:${GOLD_LIGHT}; letter-spacing:2.5px; text-transform:uppercase; padding-top:6px;">JDC Construction</div>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 16px 0; font-size:21px; line-height:28px; font-weight:700; color:${NAVY};">Your BuildOS account is ready</h1>
              <p style="margin:0 0 14px 0; font-size:15px; line-height:23px; color:#3f4a5a;">${greeting}</p>
              <p style="margin:0 0 14px 0; font-size:15px; line-height:23px; color:#3f4a5a;">
                ${from} a BuildOS account for you. BuildOS is where JDC runs jobs, schedules,
                daily logs, the time clock, and budgets — all in one place.
              </p>
              <p style="margin:0 0 24px 0; font-size:15px; line-height:23px; color:#3f4a5a;">
                Pick a password and you're in. It takes about a minute.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:${GOLD}; border-radius:10px;">
                    <a href="${url}" style="display:inline-block; padding:14px 34px; font-size:16px; line-height:20px; font-weight:600; color:#ffffff; text-decoration:none;">Set my password</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:19px; color:#6b7688;">
                Button not working? Paste this into your browser:
              </p>
              <p style="margin:0; font-size:12px; line-height:18px; word-break:break-all;">
                <a href="${url}" style="color:${NAVY}; text-decoration:underline;">${url}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f8fc; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; font-size:13px; line-height:19px; color:#6b7688;">
                    This link is good for ${escapeHtml(expiresIn)} and can only be used once.
                    If it has already expired, ask the office to send a new invite.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="background-color:${NAVY_DARK}; padding:20px 24px;">
              <p style="margin:0; font-size:12px; line-height:18px; color:#8fa2bd;">JDC Construction LLC — internal use only</p>
            </td>
          </tr>

        </table>

        <p style="max-width:540px; margin:16px auto 0 auto; font-size:12px; line-height:18px; color:#8592a6; text-align:center;">
          Weren't expecting this? You can safely ignore this email — the account stays locked until someone sets a password.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}
