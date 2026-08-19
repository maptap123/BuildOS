import { test, expect } from '@playwright/test'
import { adminClient } from './helpers/supabase-admin'

/**
 * Money path 1/3: estimate → proposal → client accept → job auto-created.
 *
 * Fully end-to-end and self-contained: seeds a lead + estimate + line via the
 * service-role client (no login needed — this exercises the same public,
 * token-based flow a real homeowner uses), drives the actual public proposal
 * page, then verifies both the estimate and the resulting job in the database.
 * Cleans up everything it creates, including the job/budget/schedule rows
 * created by the accept side-effect (src/lib/proposals/conversion.ts).
 *
 * Skipped automatically if SUPABASE_SERVICE_ROLE_KEY isn't available to the
 * test runner (see tests/helpers/supabase-admin.ts).
 */

const admin = adminClient()

test.describe('Money path: estimate accept → job created', () => {
  test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY not available — cannot seed test data')

  let leadId: string
  let estimateId: string
  let publicToken: string
  let createdJobId: string | null = null

  test.beforeAll(async () => {
    if (!admin) return

    const { data: user } = await admin.from('users').select('id').eq('is_active', true).limit(1).single()
    if (!user) throw new Error('No active user found to seed test data as')

    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({ title: `[TEST] Smoke Test Lead ${Date.now()}`, client_name: 'Smoke Test Client', created_by: user.id })
      .select('id')
      .single()
    if (leadErr || !lead) throw new Error(`Failed to seed lead: ${leadErr?.message}`)
    leadId = lead.id

    const { data: estimate, error: estErr } = await admin
      .from('estimates')
      .insert({
        lead_id: leadId,
        job_name: `[TEST] Smoke Test Job ${Date.now()}`,
        status: 'sent',
        created_by: user.id,
      })
      .select('id, public_token')
      .single()
    if (estErr || !estimate) throw new Error(`Failed to seed estimate: ${estErr?.message}`)
    estimateId = estimate.id
    publicToken = estimate.public_token

    const { error: lineErr } = await admin.from('estimate_lines').insert({
      estimate_id: estimateId,
      lead_id: leadId,
      description: 'Smoke test line item',
      quantity: 1,
      unit_cost: 500,
      markup_pct: 20,
      sort_order: 0,
    })
    if (lineErr) throw new Error(`Failed to seed estimate line: ${lineErr.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    if (createdJobId) {
      await admin.from('schedule_items').delete().eq('job_id', createdJobId)
      await admin.from('budget_lines').delete().eq('job_id', createdJobId)
      await admin.from('jobs').delete().eq('id', createdJobId)
    }
    await admin.from('estimate_lines').delete().eq('estimate_id', estimateId)
    await admin.from('estimates').delete().eq('id', estimateId)
    await admin.from('lead_activities').delete().eq('lead_id', leadId)
    await admin.from('leads').delete().eq('id', leadId)
  })

  test('public proposal page renders the seeded estimate', async ({ page }) => {
    await page.goto(`/proposals/${publicToken}`)
    await expect(page.getByText('Smoke test line item')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept Proposal' })).toBeVisible()
  })

  test('accepting creates a job and flips estimate status', async ({ page }) => {
    await page.goto(`/proposals/${publicToken}`)
    await page.getByPlaceholder('Full name').fill('Smoke Test Client')
    await page.getByPlaceholder('Type your name').fill('Smoke Test Client')
    await page.getByRole('button', { name: 'Accept Proposal' }).click()

    await expect(page.getByText('Proposal Accepted')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Job .* has been created/)).toBeVisible()

    if (!admin) return
    const { data: estimate } = await admin.from('estimates').select('status, job_id, client_approved_at').eq('id', estimateId).single()
    expect(estimate?.status).toBe('approved')
    expect(estimate?.client_approved_at).toBeTruthy()
    expect(estimate?.job_id).toBeTruthy()
    createdJobId = estimate!.job_id as string

    const { data: job } = await admin.from('jobs').select('id, name, lead_id, status').eq('id', createdJobId).single()
    expect(job?.lead_id).toBe(leadId)
    expect(job?.status).toBe('active')

    const { data: budgetLines } = await admin.from('budget_lines').select('id').eq('job_id', createdJobId)
    expect(budgetLines?.length ?? 0).toBeGreaterThan(0)
  })
})
