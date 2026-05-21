import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getWeatherForJobLocation, isIsoDate } from '@/lib/weather/open-meteo'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')
  const date = searchParams.get('date')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!jobId || !isIsoDate(date)) {
    return NextResponse.json({ error: 'Missing required fields: job_id, date' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: job, error } = await admin
    .from('jobs')
    .select('site_address, city, state, postal_code')
    .eq('id', jobId)
    .single()

  if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  try {
    const weather = await getWeatherForJobLocation(job, date)
    if (!weather) {
      return NextResponse.json({ error: 'Could not find weather for this job location.' }, { status: 404 })
    }

    return NextResponse.json(weather)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Weather lookup failed' },
      { status: 502 }
    )
  }
}
