import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeatherForJobLocation } from '@/lib/weather/open-meteo'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job_id')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()

  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase.from('daily_logs').select('*').order('log_date', { ascending: false }).order('created_at', { ascending: false })
  if (jobId) query = query.eq('job_id', jobId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    job_id,
    log_date,
    work_performed,
    cost_code,
    weather_summary,
    temperature_high,
    temperature_low,
    manpower_count,
    delays,
    safety_notes,
    inspection_notes,
    ai_summary,
  } = body

  if (!job_id || !log_date) {
    return NextResponse.json({ error: 'Missing required fields: job_id, log_date' }, { status: 400 })
  }

  // Auto-populate author_name from the user's profile
  const admin = createAdminClient()
  const { data: userRow } = await admin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .single()

  let autoWeather: Awaited<ReturnType<typeof getWeatherForJobLocation>> = null
  if (!weather_summary || temperature_high == null || temperature_low == null) {
    const { data: job, error: jobError } = await admin
      .from('jobs')
      .select('site_address, city, state, postal_code')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Could not load job location for weather.' }, { status: 400 })
    }

    if (!job.postal_code && !job.city && !job.site_address) {
      return NextResponse.json({ error: 'Add a job address, city, or ZIP before creating a daily log.' }, { status: 400 })
    }

    try {
      autoWeather = await getWeatherForJobLocation(job, log_date)
    } catch {
      // weather is non-blocking — save the log without it
    }
  }

  const { data, error } = await admin
    .from('daily_logs')
    .insert({
      job_id,
      log_date,
      logged_at: new Date().toISOString(),
      author_name: userRow?.full_name || null,
      work_performed: work_performed?.trim() || null,
      cost_code: cost_code?.trim() || null,
      weather_summary: weather_summary?.trim() || autoWeather?.weather_summary || null,
      temperature_high: temperature_high ?? autoWeather?.temperature_high ?? null,
      temperature_low: temperature_low ?? autoWeather?.temperature_low ?? null,
      manpower_count: manpower_count ?? null,
      delays: delays?.trim() || null,
      safety_notes: safety_notes?.trim() || null,
      inspection_notes: inspection_notes?.trim() || null,
      ai_summary: ai_summary?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing log id' }, { status: 400 })

  if (updates.work_performed) updates.work_performed = updates.work_performed.trim()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('daily_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await createAdminClient()
    .from('user_permissions')
    .select('can_delete')
    .eq('user_id', user.id)
    .eq('module', 'logs')
    .single()
  if (!perm?.can_delete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('daily_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
