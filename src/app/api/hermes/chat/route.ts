import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hermesStream } from '@/lib/hermes/agent'

// An estimating turn is several tool round-trips through the gateway's model, so the
// ceiling here has to clear askFixer's own budget (FIXER_TIMEOUT_MS, 4 min by default)
// with room for the conversation writes on either side of it.
export const maxDuration = 300

/**
 * The gateway answers in one shot rather than token by token, so without this the
 * socket carries zero bytes for minutes and proxies hang up on it. A comment-shaped
 * event every few seconds keeps the connection honest and gives the client something
 * to count elapsed time from.
 */
const HEARTBEAT_MS = 10_000

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'ai')
    .single()

  if (!perm?.can_view) {
    return new Response(JSON.stringify({ error: 'AI module access not granted' }), { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    message?: string
    conversation_id?: string
    job_id?: string
    estimate_id?: string
  }

  const message = body.message?.trim()
  if (!message) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const iterator = hermesStream(user.id, message, body.conversation_id, {
    jobId: body.job_id,
    estimateId: body.estimate_id,
  })

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      const startedAt = Date.now()

      try {
        // The same pending promise is raced against each tick — re-calling next()
        // per tick would pull turns off the generator and drop them.
        let pending = iterator.next()

        for (;;) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const tick = new Promise<'tick'>(resolve => {
            timer = setTimeout(() => resolve('tick'), HEARTBEAT_MS)
          })

          const settled = await Promise.race([pending.then(() => 'event' as const), tick])
          clearTimeout(timer)

          if (settled === 'tick') {
            send({ type: 'ping', elapsedMs: Date.now() - startedAt })
            continue
          }

          const { done, value } = await pending
          if (done) break

          send(value)
          if (value.type === 'done' || value.type === 'error') break

          pending = iterator.next()
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
    },

    // Browser navigated away or the user hit Stop — let the generator unwind.
    cancel() {
      void iterator.return(undefined as never)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
