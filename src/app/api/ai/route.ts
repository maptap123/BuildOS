import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { summarizeDailyLog, estimateFromDescription, generateEstimateLines } from '@/lib/ai/claude'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'ai')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { action, text } = body

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  try {
    if (action === 'summarize_log') {
      if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
      const result = await summarizeDailyLog(text)
      return NextResponse.json({ result })
    } else if (action === 'estimate') {
      if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
      const result = await estimateFromDescription(text)
      return NextResponse.json({ result })
    } else if (action === 'generate_estimate_lines') {
      const { scope, project_type, square_footage, location } = body
      const lines = await generateEstimateLines(scope ?? text, { project_type, square_footage, location })
      return NextResponse.json({ result: lines })
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI error' }, { status: 500 })
  }
}
