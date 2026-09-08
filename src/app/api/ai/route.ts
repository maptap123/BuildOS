import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'
import { summarizeDailyLog } from '@/lib/ai/summarize'

/**
 * POST /api/ai
 *
 * Daily log summarising, and nothing else. The estimate-drafting actions that
 * used to live here called Claude directly; estimating now goes through Fixer,
 * which reaches JDC's historical pricing with its own tools on /api/agent.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canUseAi = await hasModulePermOrAdmin(createAdminClient(), user.id, 'ai', 'can_view')
  if (!canUseAi) return NextResponse.json({ error: 'AI module access not granted' }, { status: 403 })

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
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI error' }, { status: 500 })
  }
}
