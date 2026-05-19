import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_manage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || null },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Ensure a public.users row exists (the trigger may not fire for invited users until they accept)
  await admin.from('users').upsert(
    {
      id: data.user.id,
      email: data.user.email,
      full_name: fullName || null,
      is_active: true,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  return NextResponse.json({ id: data.user.id, email: data.user.email })
}
