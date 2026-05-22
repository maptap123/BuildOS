import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hermesStream } from '@/lib/hermes/agent'

export const maxDuration = 60

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
  }

  const message = body.message?.trim()
  if (!message) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        for await (const event of hermesStream(user.id, message, body.conversation_id, body.job_id)) {
          send(event)
          if (event.type === 'done' || event.type === 'error') break
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
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
