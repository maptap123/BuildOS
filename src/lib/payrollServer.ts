import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, buildPayroll, type PayrollEntry } from '@/lib/payroll'

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function parseRange(start: unknown, end: unknown) {
  if (typeof start !== 'string' || typeof end !== 'string' || !YMD.test(start) || !YMD.test(end)) return null
  if (end < start) return null
  if (end > addDays(start, 31)) return null // sanity cap: one pay period, not a year
  return { start, end }
}

export async function loadPayroll(admin: ReturnType<typeof createAdminClient>, start: string, end: string) {
  // Padded window; buildPayroll trims to the exact company-timezone days.
  const from = new Date(`${addDays(start, -1)}T00:00:00Z`)
  const to = new Date(`${addDays(end, 2)}T00:00:00Z`)
  const { data, error } = await admin
    .from('time_entries')
    .select(
      'id, user_id, clock_in, clock_out, regular_hours, overtime_hours, approval_status, user:users!user_id(full_name), job:jobs!job_id(name)',
    )
    .gte('clock_in', from.toISOString())
    .lt('clock_in', to.toISOString())
    .order('clock_in', { ascending: true })
    .range(0, 4999)
  if (error) throw new Error(error.message)
  return buildPayroll((data ?? []) as unknown as PayrollEntry[], start, end)
}
