import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

/**
 * POST /api/hermes/ingest-sms
 *
 * Called by Tasker on Android when the BuildOS app is opened.
 * Receives the user's recent SMS messages and upserts them into
 * user_sms_messages for Hermes to reference.
 *
 * Body: { messages: Array<{ sender: string, body: string, received_at: string }> }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    messages?: Array<{ sender: string; body: string; received_at: string }>
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const admin = createAdminClient()

  const rows = body.messages
    .filter(m => m.sender && m.body && m.received_at)
    .map(m => ({
      user_id: user.id,
      sender: String(m.sender).trim(),
      body: String(m.body).trim(),
      received_at: new Date(m.received_at).toISOString(),
      msg_hash: createHash('sha256')
        .update(`${user.id}|${m.sender}|${m.received_at}`)
        .digest('hex'),
    }))

  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0 })

  // upsert — conflict on msg_hash is a no-op (duplicate prevention)
  const { error } = await admin
    .from('user_sms_messages')
    .upsert(rows, { onConflict: 'msg_hash', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: rows.length })
}
