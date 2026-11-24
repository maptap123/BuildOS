import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuickBooksApprover } from '@/lib/quickbooks/approvers'
import { QuickBooksApprovalsClient } from '@/components/quickbooks/QuickBooksApprovalsClient'

export const metadata = { title: 'QuickBooks approvals — BuildOS' }
export const dynamic = 'force-dynamic'

export default async function QuickBooksApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isQuickBooksApprover(createAdminClient(), user.id)) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="font-display text-xl font-semibold text-navy-900">QuickBooks approvals</h1>
        <p className="text-sm text-gray-600 mt-2">Only the people who approve changes to QuickBooks can open this page.</p>
      </div>
    )
  }
  return <QuickBooksApprovalsClient />
}
