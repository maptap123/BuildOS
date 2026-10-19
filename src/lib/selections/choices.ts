import type { SupabaseClient } from '@supabase/supabase-js'
import { reconcileAllowanceOverage, type OverageResult } from './overage'

/**
 * Picks (or un-picks) a choice. Only one choice per selection is ever picked — the
 * others are cleared first, since the database allows at most one. The selection's
 * status follows: a pick moves `pending` to `selected`, clearing it moves `selected`
 * back to `pending`; `ordered` and `installed` are left for the office to change.
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
      .update({ is_selected: false, selected_by: null, selected_at: null })
      .eq('selection_id', choice.selection_id)
      .neq('id', choiceId)
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
    if (selection.status === 'selected') {
      await admin.from('selections').update({ status: 'pending' }).eq('id', selection.id)
    }
  }

  return reconcileAllowanceOverage(admin, selection.allowance_id, userId)
}
