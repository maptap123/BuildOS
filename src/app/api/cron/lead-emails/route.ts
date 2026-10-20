import { createAdminClient } from '@/lib/supabase/admin'
import { syncRecentLeadEmails } from '@/lib/leads/emailSync'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// Daily catch-up (see vercel.json): logs the last few days of client email on
// every lead, so leads nobody opened still get their timeline filled in. The
// lead page syncs itself on open, so this only needs to run once a day.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await syncRecentLeadEmails(createAdminClient(), 2)
  return NextResponse.json(result, { status: result.error ? 500 : 200 })
}
