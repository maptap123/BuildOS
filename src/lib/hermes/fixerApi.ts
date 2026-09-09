/**
 * Fixer over HTTP
 * ===============
 * Hermes exposes an OpenAI-compatible API (`POST /v1/chat/completions`) on its
 * gateway. This is the transport that replaces the Discord thread relay in
 * `agent.ts` — that one had to post a message into a channel, poll for up to 45
 * seconds, and guess by prose heuristics which bot message was the real answer.
 *
 * Here the answer comes back in the response body, so there is no 2000-character
 * message cap, no polling, and no heuristics.
 *
 * This is the only transport. Both env vars are required — without them every
 * call throws, which is deliberate: there is no relay left to fall back to.
 *   HERMES_API_URL  — public origin of the Hermes gateway, e.g. https://fixer-api.jdcfixer.cloud
 *   HERMES_API_KEY  — the gateway's API_SERVER_KEY
 */

export interface FixerMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices?: { message?: { role?: string; content?: string } }[]
  error?: { message?: string } | string
}

/**
 * Sends a turn to Fixer and returns its reply.
 *
 * `history` is prior turns of this conversation, oldest first. Hermes keeps its own
 * session state too, but passing history makes a reply reproducible from what BuildOS
 * stored rather than depending on which session the gateway happens to be holding.
 *
 * @param timeoutMs defaults to 55s to stay inside the caller route's 60s maxDuration
 *                  on Vercel. Raise both together for work that runs longer.
 */
export async function askFixer(
  message: string,
  history: FixerMessage[] = [],
  timeoutMs = 55_000
): Promise<string> {
  const base = process.env.HERMES_API_URL
  const key = process.env.HERMES_API_KEY
  if (!base || !key) throw new Error('HERMES_API_URL and HERMES_API_KEY are not configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        stream: false,
        messages: [...history, { role: 'user', content: message }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      // Surface the gateway's own message when it sends one — a bad key and a
      // model error look identical otherwise.
      const detail = await res.text().catch(() => '')
      throw new Error(`Fixer API ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
    }

    const body = await res.json() as ChatCompletionResponse
    const reply = body.choices?.[0]?.message?.content?.trim()
    if (!reply) throw new Error('Fixer returned an empty reply')
    return reply
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Fixer did not respond within ${Math.round(timeoutMs / 1000)}s`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
