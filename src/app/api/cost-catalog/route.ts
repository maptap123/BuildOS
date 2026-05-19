import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
  const q        = searchParams.get('q')?.trim()
  const division = searchParams.get('division')?.trim()
  const phase    = searchParams.get('phase')?.trim()
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const admin = createAdminClient()
  let query = admin
    .from('cost_catalog')
    .select('id, cost_code, division_num, division_name, phase, title, uom, unit_cost, labor_cost, material_cost, cost_type')
    .eq('is_active', true)
    .order('division_num')
    .order('cost_code')
    .limit(limit)

  if (division) query = query.eq('division_num', division)
  if (phase)    query = query.eq('phase', phase)
  if (q)        query = query.ilike('title', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
