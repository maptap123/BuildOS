type Outcome = { state: 'accepted' | 'delivered' | 'failed' | 'unknown'; sid?: string }
const SID = /^SM[0-9a-fA-F]{32}$/
export function employeeSmsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER === '+18334087055')
}
function auth() { return 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64') }
function state(status: unknown): Outcome['state'] {
  return status === 'delivered' ? 'delivered' : ['failed', 'undelivered', 'canceled'].includes(String(status)) ? 'failed' : 'accepted'
}
export async function sendEmployeeSms(phone: string, body: string): Promise<Outcome> {
  if (!employeeSmsConfigured() || !/^\+[1-9][0-9]{7,14}$/.test(phone)) return { state: 'failed' }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: '+18334087055', Body: body }).toString(), signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { state: res.status >= 400 && res.status < 500 && res.status !== 408 ? 'failed' : 'unknown' }
    const data = await res.json()
    return SID.test(data.sid ?? '') ? { state: state(data.status), sid: data.sid } : { state: 'unknown' }
  } catch { return { state: 'unknown' } }
}
export async function lookupEmployeeSms(sid: string, phone: string): Promise<Outcome> {
  if (!SID.test(sid)) return { state: 'unknown' }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages/${sid}.json`, {
      headers: { Authorization: auth() }, signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { state: 'accepted', sid } // safe GET may retry; never resend.
    const data = await res.json()
    if (data.sid !== sid || data.account_sid !== process.env.TWILIO_ACCOUNT_SID || data.to !== phone || data.from !== '+18334087055') return { state: 'unknown', sid }
    return { state: state(data.status), sid }
  } catch { return { state: 'accepted', sid } }
}
