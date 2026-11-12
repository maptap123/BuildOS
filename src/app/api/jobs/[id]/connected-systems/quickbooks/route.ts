import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getQuickBooksCustomer, qbQuery, searchQuickBooksCustomers, type QBCustomerResult } from '@/lib/integrations/quickbooks/readOnlyClient'

import { createConfirmedProject, projectCreationCapability } from '@/lib/integrations/quickbooks/projectCreation'

type Context = { params: Promise<{ id: string }> }

async function activeProjectsForParent(parentId: string): Promise<QBCustomerResult[]> {
  const projects: QBCustomerResult[] = []
  for (let start = 1; ; start += 1000) {
    // ParentRef/IsProject are not assumed filterable; no user text enters query syntax.
    const page = await qbQuery<QBCustomerResult>(`SELECT * FROM Customer STARTPOSITION ${start} MAXRESULTS 1000`)
    projects.push(...page.filter(p => p.Active && p.IsProject === true && p.ParentRef?.value === parentId))
    if (page.length < 1000) return projects
    if (start >= 9001) throw new Error('Project search exceeded its safe result limit.')
  }
}

export async function GET(req: Request, { params }: Context) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const { data: officeUser } = await admin.from('users').select('is_active').eq('id', user.id).single()
  if (!officeUser?.is_active) return NextResponse.json({ error: 'Active office administrator access required.' }, { status: 403 })
  const { data: perm } = await admin.from('user_permissions').select('can_manage').eq('user_id', user.id).eq('module', 'admin').single()
  if (!perm?.can_manage) return NextResponse.json({ error: 'Office administrator access required.' }, { status: 403 })
  const { data: job, error } = await admin.from('jobs').select('id, qb_link_version, qb_customer_id, qb_parent_customer_id').eq('id', id).single()
  if (error || !job) return NextResponse.json({ error: 'Job not found or project setup migration is not installed.' }, { status: 404 })
  const url = new URL(req.url)
  const parentId = url.searchParams.get('customer_id')
  try {
    if (parentId) {
      if (!/^\d+$/.test(parentId)) return NextResponse.json({ error: 'Invalid homeowner ID.' }, { status: 400 })
      const projects = await activeProjectsForParent(parentId)
      return NextResponse.json({ job, projects, capability: projectCreationCapability() }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const term = (url.searchParams.get('search') ?? '').trim()
    const customers = term.length >= 2 ? (await searchQuickBooksCustomers(term, 100)).filter(p => p.Active && !p.Job && !p.IsProject && !p.ParentRef) : []
    return NextResponse.json({ job, customers, truncated: customers.length === 100, capability: projectCreationCapability() }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'QuickBooks could not be read. Check the connection and try again.' }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: Context) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const { data: officeUser } = await admin.from('users').select('is_active').eq('id', user.id).single()
  if (!officeUser?.is_active) return NextResponse.json({ error: 'Active office administrator access required.' }, { status: 403 })
  const { data: perm } = await admin.from('user_permissions').select('can_manage').eq('user_id', user.id).eq('module', 'admin').single()
  if (!perm?.can_manage) return NextResponse.json({ error: 'Office administrator access required.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (body?.action === 'create') {
    if (body.confirmed !== true || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 || !/^\d+$/.test(body.customer_id ?? '') || !Number.isSafeInteger(body.version) || body.version < 0) {
      return NextResponse.json({ error: 'Confirm the exact new project name and homeowner before creating it.' }, { status: 400 })
    }
    if (!projectCreationCapability().enabled) return NextResponse.json({ error: projectCreationCapability().reason }, { status: 503 })
    try {
      const parent = await getQuickBooksCustomer(body.customer_id)
      if (!parent?.Active || parent.Job || parent.IsProject || parent.ParentRef) return NextResponse.json({ error: 'Choose an active homeowner, not a sub-customer or project.' }, { status: 400 })
      const name = body.name.trim()
      // Search all exact-name matches before claiming. Never create a generic Customer Job:true.
      const findExisting = async () => (await activeProjectsForParent(parent.Id)).filter(p => p.DisplayName.toLocaleLowerCase() === name.toLocaleLowerCase())
      let matches = await findExisting()
      let graphqlId: string | null = null
      if (matches.length > 1) return NextResponse.json({ error: 'Several projects match. Select the existing project instead.' }, { status: 409 })
      if (!matches.length) {
        const claim = await admin.rpc('claim_job_quickbooks_creation', { p_job_id: id, p_version: body.version, p_parent_id: parent.Id, p_name: name, p_actor: user.id })
        if (claim.error || !claim.data) return NextResponse.json({ error: 'Creation already attempted or this connection changed. Search existing projects before retrying; no second project was created.' }, { status: 409 })
        const created = await createConfirmedProject({ customerId: parent.Id, name, confirmed: true })
        graphqlId = created.id
        // Read accounting mapping independently. GraphQL IDs are not CustomerRef IDs.
        matches = await findExisting()
        if (matches.length !== 1) return NextResponse.json({ error: 'Project creation returned, but its accounting record is not yet verified. Refresh existing projects; do not create again.' }, { status: 409 })
      }
      const { data, error } = await admin.rpc('set_job_quickbooks_project', { p_job_id: id, p_version: body.version, p_parent_id: parent.Id, p_project_id: matches[0].Id, p_name: matches[0].DisplayName, p_actor: user.id, p_graphql_id: graphqlId })
      if (error) return NextResponse.json({ error: 'Project exists in QuickBooks, but the BuildOS connection was not saved. Select the existing project to retry.' }, { status: 409 })
      return NextResponse.json({ ok: true, version: data })
    } catch {
      return NextResponse.json({ error: 'QuickBooks project creation could not be confirmed. Check Projects API access and project-management.project scope. Search existing projects before another attempt; no sub-customer fallback was used.' }, { status: 502 })
    }
  }
  if (!body || body.action !== 'select' || !/^\d+$/.test(body.customer_id ?? '') || !/^\d+$/.test(body.project_id ?? '') || !Number.isSafeInteger(body.version) || body.version < 0) {
    return NextResponse.json({ error: 'Select a homeowner and an existing QuickBooks project.' }, { status: 400 })
  }
  try {
    const [parent, project] = await Promise.all([getQuickBooksCustomer(body.customer_id), getQuickBooksCustomer(body.project_id)])
    if (!parent?.Active || parent.Job || parent.IsProject || parent.ParentRef || !project?.Active || project.IsProject !== true || project.ParentRef?.value !== parent.Id) {
      return NextResponse.json({ error: 'The selected record is not an active QuickBooks project for this homeowner.' }, { status: 400 })
    }
    const { data, error } = await admin.rpc('set_job_quickbooks_project', { p_job_id: id, p_version: body.version, p_parent_id: parent.Id, p_project_id: project.Id, p_name: project.DisplayName, p_actor: user.id })
    if (error) return NextResponse.json({ error: 'Connection changed or could not be saved. Reload and try again.' }, { status: 409 })
    return NextResponse.json({ ok: true, version: data })
  } catch {
    return NextResponse.json({ error: 'The QuickBooks connection could not be verified. Reload before retrying.' }, { status: 502 })
  }
}
