import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasModulePermOrAdmin } from '@/lib/permissions/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canEdit = await hasModulePermOrAdmin(createAdminClient(), user.id, 'vendors', 'can_edit')
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  const stringFields = ['name', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'trade', 'license_number', 'notes']
  for (const field of stringFields) {
    if (field in body) {
      updates[field] = body[field] ? String(body[field]).trim() : null
    }
  }
  if ('vendor_type' in body) updates.vendor_type = body.vendor_type
  if ('insurance_expiry' in body) updates.insurance_expiry = body.insurance_expiry || null
  if ('is_active' in body) updates.is_active = body.is_active

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canDelete = await hasModulePermOrAdmin(createAdminClient(), user.id, 'vendors', 'can_delete')
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .update({ is_active: false })
    .eq('id', id)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
