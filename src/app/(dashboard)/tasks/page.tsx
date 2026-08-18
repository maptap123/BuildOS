import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MyTasksClient } from '@/components/tasks/MyTasksClient'

// Cross-job "My Tasks" — the mobile Tasks tab lands here (desktop keeps
// job-scoped tasks under Operations → Tasks).
export default async function MyTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <MyTasksClient />
}
