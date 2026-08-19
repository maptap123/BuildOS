// Posts BuildOS system alerts into the existing Hermes Discord channel via the bot token.
// Best-effort: a Discord failure must never block the in-app notification from being written.

const DISCORD_API = 'https://discord.com/api/v10'
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const ALERTS_CHANNEL_ID = process.env.DISCORD_ALERTS_CHANNEL_ID || process.env.DISCORD_HERMES_CHANNEL_ID || ''

export async function postDiscordAlert(content: string): Promise<void> {
  if (!BOT_TOKEN || !ALERTS_CHANNEL_ID) return

  try {
    const res = await fetch(`${DISCORD_API}/channels/${ALERTS_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${BOT_TOKEN}`,
      },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    })
    if (!res.ok) {
      console.error(`[notifications] Discord post failed: ${res.status} ${await res.text()}`)
    }
  } catch (err) {
    console.error('[notifications] Discord post threw', err)
  }
}
