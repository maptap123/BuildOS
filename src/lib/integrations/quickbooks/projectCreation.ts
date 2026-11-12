import { createAdminClient } from '@/lib/supabase/admin'
import { loadQBTokens } from '@/lib/integrations/quickbooks/readOnlyClient'
import { refreshTokenIfNeeded } from '@/lib/quickbooks/client'

// Separate from the GET-only accounting client. Never a generic QBO write transport.
export function projectCreationCapability() {
  const enabled = process.env.ENABLE_QB_PROJECT_CREATION === 'true' && process.env.QB_PROJECT_SCOPE_ENABLED === 'true'
  return { enabled, reason: enabled ? null : 'Project creation is disabled. Enable the Intuit Projects API, reconnect with project-management.project scope, then enable the dedicated project-creation flag. Existing projects can still be selected.' }
}

type Project = { id: string; name: string; customer: { id: string } }
const CREATE = `mutation BuildOSCreateProject($name: String!, $customer: ProjectManagement_CustomerInput!) {
  projectManagementCreateProject(input: {name: $name, customer: $customer}) {
    ... on ProjectManagement_Project { id name customer { id } }
  }
}`
const VERIFY = `query BuildOSVerifyProject($id: ID!) {
  projectManagementProject(id: $id) { id name customer { id } }
}`

/** Called only after the route's durable claim, permission check and explicit confirmation. No automatic mutation retry. */
export async function createConfirmedProject(input: { customerId: string; name: string; confirmed: boolean }): Promise<Project> {
  if (!projectCreationCapability().enabled || input.confirmed !== true || !/^\d+$/.test(input.customerId) || !input.name.trim() || input.name.length > 100) throw new Error('Confirmed project creation is not enabled.')
  const tokens = await refreshTokenIfNeeded(createAdminClient(), await loadQBTokens())
  const endpoint = process.env.QB_ENVIRONMENT === 'sandbox' ? 'https://qb-sandbox.api.intuit.com/graphql' : 'https://qb.api.intuit.com/graphql'
  // Kept private: callers cannot supply arbitrary GraphQL or REST mutations.
  const call = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(25000) })
    const json = await response.json()
    if (!response.ok || json.errors?.length) throw new Error('Projects API denied or unavailable. Check project-management.project scope and app activation.')
    return json.data
  }
  const created: Project | undefined = (await call(CREATE, { name: input.name.trim(), customer: { id: input.customerId } }))?.projectManagementCreateProject
  if (!created?.id) throw new Error('Projects API did not return a project ID.')
  const verified: Project | undefined = (await call(VERIFY, { id: created.id }))?.projectManagementProject
  if (!verified || verified.id !== created.id || verified.name !== input.name.trim() || verified.customer?.id !== input.customerId) throw new Error('Projects API project/homeowner verification failed.')
  return verified
}
