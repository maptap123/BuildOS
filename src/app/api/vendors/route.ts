import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const vendorType = searchParams.get('vendor_type')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_view) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabase
    .from('vendors')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (vendorType) {
    query = query.eq('vendor_type', vendorType)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('can_create')
    .eq('user_id', user.id)
    .eq('module', 'jobs')
    .single()
  if (!perm?.can_create) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    name,
    contact_name = null,
    email = null,
    phone = null,
    address = null,
    city = null,
    state = null,
    zip = null,
    vendor_type = 'subcontractor',
    trade = null,
    license_number = null,
    insurance_expiry = null,
    notes = null,
  } = body

  if (!name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .insert({
      name: String(name).trim(),
      contact_name: contact_name ? String(contact_name).trim() : null,
      email: email ? String(email).trim() : null,
      phone: phone ? String(phone).trim() : null,
      address: address ? String(address).trim() : null,
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      zip: zip ? String(zip).trim() : null,
      vendor_type,
      trade: trade ? String(trade).trim() : null,
      license_number: license_number ? String(license_number).trim() : null,
      insurance_expiry: insurance_expiry || null,
      notes: notes ? String(notes).trim() : null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
