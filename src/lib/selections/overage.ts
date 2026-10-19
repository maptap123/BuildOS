import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Overage → change order
 * ======================
 * In BuilderTrend an allowance that ran over just showed a negative number; 55 of JDC's
 * 129 allowances did, by $65,700, and nothing turned that into a bill. Here, every time
 * a choice is picked or un-picked, the allowance's overage is compared with what has
 * already been billed for it, and the difference lands on a DRAFT change order. The
 * office reviews the draft and sends it through the existing /co/[token] link.
 *
 * One open draft per allowance: a later pick updates it rather than stacking a new one.
 * Once a CO is submitted or approved its amount counts as billed, and any further overage
 * goes on a fresh draft. When the overage disappears (a cheaper choice), the draft goes.
 * The overage is client price minus allowance — client prices already carry markup.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

export async function nextChangeOrderNumber(admin: SupabaseClient, jobId: string): Promise<string> {
  const { data } = await admin
    .from('change_orders')
    .select('co_number')
    .eq('job_id', jobId)
    .order('co_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.co_number ? parseInt(String(data[0].co_number).replace('CO-', ''), 10) : 0
  return `CO-${String((Number.isFinite(last) ? last : 0) + 1).padStart(3, '0')}`
}

export type OverageResult = {
  overage: number
  billed: number
  draft: { id: string; co_number: string; amount: number } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export async function reconcileAllowanceOverage(
  admin: SupabaseClient,
  allowanceId: string | null | undefined,
  userId: string,
): Promise<OverageResult | null> {
  if (!allowanceId) return null

  const { data: allowance } = await admin
    .from('allowances')
    .select('id, job_id, title, amount')
    .eq('id', allowanceId)
    .single()
  if (!allowance) return null

  const [{ data: sels }, { data: cos }] = await Promise.all([
    admin
      .from('selections')
      .select('title, selection_choices(title, client_price, is_selected)')
      .eq('allowance_id', allowanceId),
    admin
      .from('change_orders')
      .select('id, co_number, status, amount')
      .eq('allowance_id', allowanceId)
      .order('co_number'),
  ])

  const picks = (sels ?? []).flatMap(s =>
    ((s.selection_choices ?? []) as { title: string; client_price: number; is_selected: boolean }[])
      .filter(c => c.is_selected)
      .map(c => ({ selection: s.title as string, choice: c.title, price: Number(c.client_price) })))
  const spent = round2(picks.reduce((sum, p) => sum + p.price, 0))
  const overage = round2(Math.max(0, spent - Number(allowance.amount)))

  const billed = round2((cos ?? [])
    .filter(c => c.status === 'submitted' || c.status === 'approved')
    .reduce((sum, c) => sum + Number(c.amount), 0))
  const draft = (cos ?? []).find(c => c.status === 'draft') ?? null
  const due = round2(overage - billed)

  if (due <= 0) {
    if (draft) await admin.from('change_orders').delete().eq('id', draft.id)
    return { overage, billed, draft: null }
  }

  const description = [
    `${allowance.title}: allowance ${fmt(Number(allowance.amount))}, selected ${fmt(spent)}.`,
    ...picks.map(p => `• ${p.selection}: ${p.choice} (${fmt(p.price)})`),
    billed > 0 ? `Already billed on earlier change orders: ${fmt(billed)}.` : '',
  ].filter(Boolean).join('\n')

  if (draft) {
    await admin.from('change_orders').update({ amount: due, description }).eq('id', draft.id)
    return { overage, billed, draft: { id: draft.id, co_number: draft.co_number, amount: due } }
  }

  const co_number = await nextChangeOrderNumber(admin, allowance.job_id)
  const { data: created } = await admin
    .from('change_orders')
    .insert({
      job_id: allowance.job_id,
      co_number,
      title: `${allowance.title} allowance overage`,
      description,
      status: 'draft',
      type: 'additive',
      amount: due,
      reason: 'Allowance overage',
      allowance_id: allowanceId,
      created_by: userId,
    })
    .select('id, co_number')
    .single()

  return { overage, billed, draft: created ? { id: created.id, co_number: created.co_number, amount: due } : null }
}
