import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { syncLeadEmails } from '@/lib/leads/emailSync'
import { NextResponse } from 'next/server'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// The lead page calls this on open; skip a re-search inside this window unless forced.
const THROTTLE_MS = 2 * 60 * 1000

/** Pulls this lead's client emails from the team's Outlook mailboxes onto the timeline. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const canView = await hasModulePermOrAdmin(admin, user.id, 'leads', 'can_view')
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: lead } = await admin
    .from('leads')
    .select('id, client_email, created_at, emails_synced_at')
    .eq('id', id)
    .single()
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const force = new URL(request.url).searchParams.get('force') === '1'
  if (!force && lead.emails_synced_at && Date.now() - Date.parse(lead.emails_synced_at) < THROTTLE_MS) {
    return NextResponse.json({ added: [], skipped: true })
  }

  const result = await syncLeadEmails(admin, lead)
  return NextResponse.json(result)
}
