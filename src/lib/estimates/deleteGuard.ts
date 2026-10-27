export type ProtectedReason =
  | 'not_found'
  | 'approved'
  | 'sent'
  | 'rejected'
  | 'voided'
  | 'unknown_status'
  | 'locked'
  | 'client_response'

/**
 * Returns the reason an estimate cannot be deleted, or null if deletion is safe.
 * Only a pristine draft (status=draft, is_locked=false, no client response) may be
 * deleted. Fail-closed: any unexpected status or null is_locked returns a reason.
 */
export function estimateDeletionBlockedReason(
  estimate: {
    status: string
    is_locked: boolean | null
    client_approved_at: string | null
    client_rejected_at: string | null
    client_name?: string | null
    client_signature?: string | null
    client_response_note?: string | null
  } | null,
): ProtectedReason | null {
  if (!estimate) return 'not_found'
  if (estimate.status === 'approved') return 'approved'
  if (estimate.status === 'sent')     return 'sent'
  if (estimate.status === 'rejected') return 'rejected'
  if (estimate.status === 'voided')   return 'voided'
  // Fail closed: any status other than draft is unknown and blocked
  if (estimate.status !== 'draft')    return 'unknown_status'
  // Only explicit false allows deletion — null is treated as locked
  if (estimate.is_locked !== false)   return 'locked'
  if (estimate.client_approved_at)    return 'client_response'
  if (estimate.client_rejected_at)    return 'client_response'
  if (estimate.client_name)           return 'client_response'
  if (estimate.client_signature)      return 'client_response'
  if (estimate.client_response_note)  return 'client_response'
  return null
}

type PermRow = { can_view: boolean; can_delete: boolean } | null

/**
 * Resolve whether the acting user may delete estimates.
 *
 * When an `estimates` module row EXISTS (even with can_view=false), that row
 * governs exclusively — the budget fallback is NOT consulted.
 * When no estimates row exists (null), falls back to the budget row.
 * Both paths require can_view AND can_delete to return true.
 */
export function resolveDeletePermission(
  estimatesPerm: PermRow,
  budgetPerm:    PermRow,
): boolean {
  if (estimatesPerm !== null) {
    return estimatesPerm.can_view === true && estimatesPerm.can_delete === true
  }
  return (budgetPerm?.can_view === true) && (budgetPerm?.can_delete === true)
}
