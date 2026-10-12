import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCostCode } from './costCodes'

/**
 * Remembers a line's allowance against its cost code, so the next estimate line with
 * that code starts with it filled in (the insert trigger in migration 058 does the
 * filling). Clearing the allowance clears what is remembered — the last one entered
 * for a code is the one future estimates get.
 *
 * Estimates already written keep their own copy either way.
 */
export async function rememberAllowance(
  admin: SupabaseClient,
  costCode: string | null | undefined,
  allowance: string | null | undefined,
  userId: string,
): Promise<void> {
  const code_key = normalizeCostCode(costCode)
  if (!code_key) return

  const text = (allowance ?? '').trim()
  if (!text) {
    await admin.from('cost_code_allowances').delete().eq('code_key', code_key)
    return
  }

  await admin
    .from('cost_code_allowances')
    .upsert(
      { code_key, allowance: text, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'code_key' },
    )
}
