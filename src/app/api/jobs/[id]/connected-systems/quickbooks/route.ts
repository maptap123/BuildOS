import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getQuickBooksCustomer, qbQuery, searchQuickBooksCustomers, type QBCustomerResult } from '@/lib/integrations/quickbooks/readOnlyClient'
import { isQuickBooksApprover } from '@/lib/quickbooks/approvers'
import { proposeQuickBooksChange } from '@/lib/quickbooks/changeRequests'
import { executeApprovedChange, type ChangeRow } from '@/lib/quickbooks/approvedWrite'

type Context = { params: Promise<{ id: string }> }

/**
 * A homeowner's existing jobs in QuickBooks: real Projects AND ordinary sub-customers (jobs
 * nested under the homeowner). JDC's history is mostly sub-customers, so listing only Projects
 * made the picker look empty.
 */
async function activeJobsForParent(parentId: string): Promise<QBCustomerResult[]> {
  const jobs: QBCustomerResult[] = []
  for (let start = 1; ; start += 1000) {
    // ParentRef is not assumed filterable; no user text enters query syntax.
    const page = await qbQuery<QBCustomerResult>(`SELECT * FROM Customer STARTPOSITION ${start} MAXRESULTS 1000`)
    jobs.push(...page.filter(p => p.Active && p.ParentRef?.value === parentId))
    if (page.length < 1000) return jobs
    if (start >= 9001) throw new Error('Job search exceeded its safe result limit.')
  }
}

const isTopLevel = (c: QBCustomerResult | null) => !!c && c.Active && !c.Job && !c.IsProject && !c.ParentRef

async function requireAdmin(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: officeUser } = await admin.from('users').select('is_active, full_name').eq('id', user.id).single()
  if (!officeUser?.is_active) return { response: NextResponse.json({ error: 'Active office administrator access required.' }, { status: 403 }) }
  const { data: perm } = await admin.from('user_permissions').select('can_manage').eq('user_id', user.id).eq('module', 'admin').single()
  if (!perm?.can_manage) return { response: NextResponse.json({ error: 'Office administrator access required.' }, { status: 403 }) }
  const { data: job, error } = await admin.from('jobs').select('id, qb_link_version, qb_customer_id, qb_parent_customer_id').eq('id', id).single()
  if (error || !job) return { response: NextResponse.json({ error: 'Job not found or project setup migration is not installed.' }, { status: 404 }) }
  return { user, admin, job, userName: officeUser.full_name as string | null }
}

export async function GET(req: Request, { params }: Context) {
  const { id } = await params
  const ctx = await requireAdmin(id)
  if ('response' in ctx) return ctx.response
  const { admin, job, user } = ctx
  const canCreate = await isQuickBooksApprover(admin, user.id)
  const url = new URL(req.url)
  const parentId = url.searchParams.get('customer_id')
  try {
    if (parentId) {
      if (!/^\d+$/.test(parentId)) return NextResponse.json({ error: 'Invalid homeowner ID.' }, { status: 400 })
      const projects = await activeJobsForParent(parentId)
      return NextResponse.json({ job, projects, canCreate }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const term = (url.searchParams.get('search') ?? '').trim()
    const customers = term.length >= 2 ? (await searchQuickBooksCustomers(term, 100)).filter(isTopLevel) : []
    return NextResponse.json({ job, customers, truncated: customers.length === 100, canCreate }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'QuickBooks could not be read. Check the connection and try again.' }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: Context) {
  const { id } = await params
  const ctx = await requireAdmin(id)
  if ('response' in ctx) return ctx.response
  const { admin, user, userName } = ctx
  const body = await req.json().catch(() => null)

  // Create a new job as a QuickBooks sub-customer. This is a QuickBooks WRITE, so it goes through the
  // same machinery as Fixer's proposals: validated, claimed by an approver, then executed by approvedWrite.
  // Clicking the confirmed button here IS the approval, so it is limited to people in qb_approvers.
  if (body?.action === 'create') {
    if (body.confirmed !== true || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 || !/^\d+$/.test(body.customer_id ?? '') || !Number.isSafeInteger(body.version) || body.version < 0) {
      return NextResponse.json({ error: 'Confirm the exact new job name and homeowner before creating it.' }, { status: 400 })
    }
    if (!await isQuickBooksApprover(admin, user.id)) {
      return NextResponse.json({ error: 'Only QuickBooks approvers (August, Lisa, Jason, Evelyn) can create a job in QuickBooks. Ask one of them, or ask Fixer to propose it.' }, { status: 403 })
    }
    try {
      const parent = await getQuickBooksCustomer(body.customer_id)
      if (!isTopLevel(parent)) return NextResponse.json({ error: 'Choose an active homeowner, not a sub-customer or project.' }, { status: 400 })
      const name = body.name.trim()

      // Same name already under this homeowner: link to it instead of making a twin.
      const existing = (await activeJobsForParent(parent!.Id)).filter(p => p.DisplayName.toLocaleLowerCase() === name.toLocaleLowerCase())
      if (existing.length > 1) return NextResponse.json({ error: 'Several jobs match that name. Select the existing job instead.' }, { status: 409 })
      let newId: string
      if (existing.length === 1) {
        newId = existing[0].Id
      } else {
        const claim = await admin.rpc('claim_job_quickbooks_creation', { p_job_id: id, p_version: body.version, p_parent_id: parent!.Id, p_name: name, p_actor: user.id })
        if (claim.error || !claim.data) return NextResponse.json({ error: 'Creation was already attempted for this job and name, or the connection changed. Search the existing jobs before retrying; nothing was created twice.' }, { status: 409 })
        const proposed = await proposeQuickBooksChange(admin, user.id, {
          entity: 'customer', action: 'create', job_id: id,
          data: { DisplayName: name, Job: true, BillWithParent: true, ParentRef: { value: parent!.Id } },
          reason: 'Created from the job\'s QuickBooks setup window', requested_by_name: userName ?? 'BuildOS user',
        }, { notify: false })
        if (!proposed.ok) return NextResponse.json({ error: proposed.error ?? 'Could not prepare the QuickBooks job.' }, { status: 400 })
        const requestId = proposed.data?.request_id as string
        const approved = await admin.rpc('claim_qb_change', { p_id: requestId, p_actor: user.id })
        if (approved.error || !approved.data) return NextResponse.json({ error: approved.error?.message ?? 'Could not approve the change.' }, { status: 409 })
        try {
          const done = await executeApprovedChange(admin, approved.data as ChangeRow)
          await admin.from('qb_change_requests').update({ status: 'executed', result: done.result, result_qb_id: done.qbId, error: null }).eq('id', requestId)
          if (!done.qbId) throw new Error('QuickBooks did not return an ID for the new job')
          newId = done.qbId
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          await admin.from('qb_change_requests').update({ status: 'failed', error: msg }).eq('id', requestId)
          return NextResponse.json({ error: `QuickBooks did not create the job: ${msg}` }, { status: 502 })
        }
      }
      const { data, error } = await admin.rpc('set_job_quickbooks_project', { p_job_id: id, p_version: body.version, p_parent_id: parent!.Id, p_project_id: newId, p_name: name, p_actor: user.id, p_graphql_id: null })
      if (error) return NextResponse.json({ error: `The job exists in QuickBooks (#${newId}) but BuildOS did not save the connection. Reopen this window and select it from the existing jobs.` }, { status: 409 })
      return NextResponse.json({ ok: true, version: data, qb_id: newId })
    } catch {
      return NextResponse.json({ error: 'QuickBooks could not be reached, so nothing was confirmed. Search the existing jobs before trying again.' }, { status: 502 })
    }
  }

  // Link a job that already exists in QuickBooks (a Project or an ordinary sub-customer). BuildOS only.
  if (!body || body.action !== 'select' || !/^\d+$/.test(body.customer_id ?? '') || !/^\d+$/.test(body.project_id ?? '') || !Number.isSafeInteger(body.version) || body.version < 0) {
    return NextResponse.json({ error: 'Select a homeowner and an existing QuickBooks job.' }, { status: 400 })
  }
  try {
    const [parent, project] = await Promise.all([getQuickBooksCustomer(body.customer_id), getQuickBooksCustomer(body.project_id)])
    if (!isTopLevel(parent) || !project?.Active || project.ParentRef?.value !== parent!.Id) {
      return NextResponse.json({ error: 'The selected record is not an active QuickBooks job for this homeowner.' }, { status: 400 })
    }
    const { data, error } = await admin.rpc('set_job_quickbooks_project', { p_job_id: id, p_version: body.version, p_parent_id: parent!.Id, p_project_id: project.Id, p_name: project.DisplayName, p_actor: user.id })
    if (error) return NextResponse.json({ error: 'Connection changed or could not be saved. Reload and try again.' }, { status: 409 })
    return NextResponse.json({ ok: true, version: data })
  } catch {
    return NextResponse.json({ error: 'The QuickBooks connection could not be verified. Reload before retrying.' }, { status: 502 })
  }
}
