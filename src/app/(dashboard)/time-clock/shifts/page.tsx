import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShiftsClient } from '@/components/time-clock/ShiftsClient'

// ─── Date range helpers ────────────────────────────────────────────────────────

export type ShiftRange = 'today' | '7d' | '30d' | '90d' | '1y' | 'all'

function computeCutoff(range: ShiftRange): string | null {
  if (range === 'all') return null
  const d = new Date()
  if (range === 'today')  { d.setHours(0, 0, 0, 0); return d.toISOString() }
  if (range === '7d')  d.setDate(d.getDate() - 7)
  if (range === '30d') d.setDate(d.getDate() - 30)
  if (range === '90d') d.setDate(d.getDate() - 90)
  if (range === '1y')  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Only admins/managers can access shift management
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_manage')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!perm?.can_manage) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4">
          You don&apos;t have permission to manage shifts.
        </div>
      </div>
    )
  }

  const { range: rawRange } = await searchParams
  const VALID_RANGES: ShiftRange[] = ['today', '7d', '30d', '90d', '1y', 'all']
  const range: ShiftRange = VALID_RANGES.includes(rawRange as ShiftRange)
    ? (rawRange as ShiftRange)
    : '30d'

  const cutoff = computeCutoff(range)

  // Hours and labor cost are summed from whatever rows come back, so a silent
  // row cap means a manager approves payroll against understated totals.
  // Supabase enforces its own db-max-rows (1000 by default) on top of this
  // range, so asking for more does not guarantee more — the exact count is what
  // lets the client say how much of the range it is actually showing.
  const ROW_CAP = 5000

  const [{ data: entries, count: totalCount }, { data: users }, { data: jobs }] = await Promise.all([
    (() => {
      let q = admin
        .from('time_entries')
        // Hint the FK to use — time_entries has 3 FKs to users (user_id, created_by, approved_by)
        // Without the hint PostgREST returns null data with an ambiguous relationship error
        .select(
          '*, user:users!user_id(id, full_name, avatar_url, hourly_rate), job:jobs!job_id(id, name, job_number)',
          { count: 'exact' },
        )
        .order('clock_in', { ascending: false })
      if (cutoff) q = q.gte('clock_in', cutoff)
      return q.range(0, ROW_CAP - 1)
    })(),

    admin
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),

    admin
      .from('jobs')
      .select('id, name, job_number')
      .in('status', ['active', 'presale', 'closed'])
      .order('name', { ascending: true }),
  ])

  return (
    <ShiftsClient
      initialEntries={entries ?? []}
      users={users ?? []}
      jobs={jobs ?? []}
      currentRange={range}
      totalCount={totalCount ?? entries?.length ?? 0}
    />
  )
}
