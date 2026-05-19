import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/estimates?lead_id=<uuid>
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const leadId = searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('estimates')
    .select('*')
    .eq('lead_id', leadId)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/estimates  — create a new estimate for a lead
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'budget')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { lead_id, title, job_name, markup_pct = 0, notes } = body
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Determine next version number for this lead
  const { count } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead_id)

  const version = (count ?? 0) + 1

  const { data, error } = await admin
    .from('estimates')
    .insert({
      lead_id,
      title:      title?.trim() || `Estimate v${version}`,
      job_name:   job_name?.trim() || '',
      markup_pct: Number(markup_pct) || 0,
      notes:      notes?.trim() || null,
      status:     'draft',
      version,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
