import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { VendorsClient } from '@/components/vendors/VendorsClient'
import type { Vendor } from '@/types'

export default async function VendorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: vendorPerm }, { data: jobPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'vendors').single(),
    admin.from('user_permissions').select('can_create, can_edit').eq('user_id', user.id).eq('module', 'jobs').single(),
  ])

  if (!vendorPerm?.can_view && !jobPerm?.can_create && !jobPerm?.can_edit) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        You don&apos;t have permission to view vendors.
      </div>
    )
  }

  const { data: vendors } = await admin
    .from('vendors')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return <VendorsClient initialVendors={(vendors ?? []) as Vendor[]} />
}
