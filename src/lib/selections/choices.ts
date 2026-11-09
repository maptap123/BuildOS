import type { SupabaseClient } from '@supabase/supabase-js'
import { reconcileAllowanceOverage, type OverageResult } from './overage'

/**
 * Picks (or un-picks) a choice. A selection can have several picked at once (three
 * faucets on one "fixtures" selection); each counts against the allowance. The
 * selection's status follows: a pick moves `pending` to `selected`, clearing the last
 * pick moves `selected` back to `pending`; `ordered` and `installed` are left for the office to change.
 * Then the allowance's overage is re-worked, which drafts or updates the change order.
 */
export async function applyChoicePick(
  admin: SupabaseClient,
  choiceId: string,
  selected: boolean,
  userId: string,
): Promise<OverageResult | null> {
  const { data: choice } = await admin
    .from('selection_choices')
    .select('id, selection_id, selections(id, status, allowance_id)')
    .eq('id', choiceId)
    .single()
  if (!choice) return null
  const selection = choice.selections as unknown as { id: string; status: string; allowance_id: string | null }

  if (selected) {
    await admin
      .from('selection_choices')
      .update({ is_selected: true, selected_by: userId, selected_at: new Date().toISOString() })
      .eq('id', choiceId)
    if (selection.status === 'pending') {
      await admin.from('selections').update({ status: 'selected' }).eq('id', selection.id)
    }
  } else {
    await admin
      .from('selection_choices')
      .update({ is_selected: false, selected_by: null, selected_at: null })
      .eq('id', choiceId)
    const { count } = await admin
      .from('selection_choices')
      .select('id', { count: 'exact', head: true })
      .eq('selection_id', choice.selection_id)
      .eq('is_selected', true)
    if (selection.status === 'selected' && !count) {
      await admin.from('selections').update({ status: 'pending' }).eq('id', selection.id)
    }
  }

  return reconcileAllowanceOverage(admin, selection.allowance_id, userId)
}
