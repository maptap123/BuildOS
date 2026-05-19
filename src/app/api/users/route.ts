import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: users } = await admin
    .from('users')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('email', { ascending: true })

  return NextResponse.json(users ?? [])
}
