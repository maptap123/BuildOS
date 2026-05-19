import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

async function requireAdmin(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', userId)
    .eq('module', 'admin')
    .single()
  return data?.can_manage ?? false
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: tags } = await admin
    .from('job_tag_options')
    .select('id, name, sort_order')
    .order('sort_order')
    .order('name')

  return NextResponse.json(tags ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await requireAdmin(admin, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data: tag, error } = await admin
    .from('job_tag_options')
    .insert({ name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(tag, { status: 201 })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!await requireAdmin(admin, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await admin
    .from('job_tag_options')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
