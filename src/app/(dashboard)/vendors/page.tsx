import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { VendorsClient } from '@/components/vendors/VendorsClient'
import type { Vendor } from '@/types'

export default async function VendorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vendors } = await supabase
    .from('vendors')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return <VendorsClient initialVendors={(vendors ?? []) as Vendor[]} />
}
