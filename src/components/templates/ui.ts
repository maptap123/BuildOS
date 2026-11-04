// Shared class names + types for the template screens.
export const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400'
export const labelCls = 'block text-[11px] font-medium text-gray-500 mb-1'
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors'
export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors'

export type Pred = { item_id: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag_days: number }
export type SchedItem = {
  id: string; title: string; notes: string | null; start_offset: number; duration: number
  item_type: 'phase' | 'milestone'; color: string | null; trade: string | null
  assignees: string[]; predecessors: Pred[]; sort_order: number
}
export type TplTask = {
  id: string; parent_id: string | null; title: string; description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'; due_offset: number | null
  assignees: string[]; schedule_item_id: string | null; sort_order: number
}
export type TplSelection = {
  id: string; title: string; cost_code: string | null; location: string | null
  instructions: string | null; deadline_offset: number | null; vendor_names: string[]; sort_order: number
}
export type JobTemplate = {
  id: string; name: string; description: string | null; color: string | null
  work_days: Record<string, boolean>; internal_notes: string | null; sub_notes: string | null
  schedule_items: SchedItem[]; tasks: TplTask[]; selections: TplSelection[]
}
export type ActivityStep = {
  kind: string; title: string; offset_days: number; subject: string | null; body: string | null; assign_to: string
}
export type ActivityTemplate = { id: string; name: string; description: string | null; steps: ActivityStep[] }
export type DocumentTemplate = {
  id: string; kind: string; name: string; body: string; is_default: boolean
}

export const DOC_KINDS: Record<string, string> = {
  lien_waiver: 'Lien waiver',
  email: 'Email',
  proposal_intro: 'Proposal intro',
  proposal_closing: 'Proposal closing',
  other: 'Other',
}

/** Variables a document template can use, by kind. They render as {{name}}. */
export const DOC_VARIABLES: Record<string, string[]> = {
  lien_waiver: ['subcontractor', 'jobAddress', 'effectiveDate', 'paymentAmount', 'totalPaid', 'lotParcel'],
  email: ['firstName', 'lastName', 'displayName', 'jobName', 'jobAddress', 'signature'],
  proposal_intro: ['clientName', 'jobName', 'jobAddress'],
  proposal_closing: ['clientName', 'jobName', 'jobAddress'],
  other: ['clientName', 'jobName', 'jobAddress'],
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
  return body as T
}
