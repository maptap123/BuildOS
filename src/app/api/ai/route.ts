import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { summarizeDailyLog, estimateFromDescription } from '@/lib/ai/claude'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'ai')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { action, text } = body

  if (!action || !text) {
    return NextResponse.json({ error: 'action and text are required' }, { status: 400 })
  }

  try {
    let result: string
    if (action === 'summarize_log') {
      result = await summarizeDailyLog(text)
    } else if (action === 'estimate') {
      result = await estimateFromDescription(text)
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI error' }, { status: 500 })
  }
}
