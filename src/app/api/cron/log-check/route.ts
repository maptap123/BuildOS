import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getJobNotifyTargets } from '@/lib/notifications'
import { NextResponse } from 'next/server'

// Runs weekdays at 4pm America/New_York (see vercel.json). For every active job
// with no daily log dated today, notifies the job's PM (falls back to all admins).
// Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET` — require it
// so this can't be hit by anyone who finds the URL.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) // YYYY-MM-DD

  const { data: activeJobs, error: jobsError } = await admin
    .from('jobs')
    .select('id, name, project_manager_id')
    .eq('status', 'active')

  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 })
  if (!activeJobs || activeJobs.length === 0) return NextResponse.json({ checked: 0, notified: 0 })

  const { data: loggedToday } = await admin
    .from('daily_logs')
    .select('job_id')
    .eq('log_date', today)
    .in('job_id', activeJobs.map((j) => j.id))

  const loggedJobIds = new Set((loggedToday ?? []).map((l) => l.job_id))
  const missing = activeJobs.filter((j) => !loggedJobIds.has(j.id))

  for (const job of missing) {
    const targets = await getJobNotifyTargets(job.id, admin)
    await notify({
      admin,
      userIds: targets,
      type: 'log_missing',
      title: `No daily log yet for ${job.name}`,
      body: `No log has been submitted today (${today}).`,
      link: `/jobs/${job.id}/logs`,
    })
  }

  return NextResponse.json({ checked: activeJobs.length, notified: missing.length })
}
