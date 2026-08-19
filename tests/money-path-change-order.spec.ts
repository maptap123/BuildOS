import { test, expect } from '@playwright/test'
import { adminClient } from './helpers/supabase-admin'

/**
 * Money path 2/3: change order → client sign → status updated.
 *
 * Seeds a throwaway job + submitted change order via the service-role client,
 * drives the actual public CO approval page (no login — this is the same
 * token-based link a homeowner receives), and verifies the DB reflects the
 * approval. Cleans up everything it creates.
 *
 * Note (found during Week 2 Day 10 smoke testing): approving a change order
 * here does NOT currently touch budget_lines — src/app/api/change-orders/
 * client/[token]/route.ts only updates the change_order row itself. There's
 * no code path anywhere that creates/updates a budget_line from an approved
 * CO. This test verifies what the code actually does today, not the
 * "CO → budget update" behavior LAUNCH_PLAN.md's Day 10 description assumes
 * exists — flagged as a September fast-follow, not a launch blocker per the
 * plan's own scope (budget still reflects reality via the change_orders tab).
 */

const admin = adminClient()

test.describe('Money path: change order sign', () => {
  test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY not available — cannot seed test data')

  let jobId: string
  let coId: string
  let clientToken: string

  test.beforeAll(async () => {
    if (!admin) return

    const { data: user } = await admin.from('users').select('id').eq('is_active', true).limit(1).single()
    if (!user) throw new Error('No active user found to seed test data as')

    const { data: job, error: jobErr } = await admin
      .from('jobs')
      .insert({
        job_number: `TEST-${Date.now()}`,
        name: `[TEST] Smoke Test Job ${Date.now()}`,
        client_name: 'Smoke Test Client',
        site_address: '123 Test St',
        status: 'active',
        created_by: user.id,
      })
      .select('id')
      .single()
    if (jobErr || !job) throw new Error(`Failed to seed job: ${jobErr?.message}`)
    jobId = job.id

    const { data: co, error: coErr } = await admin
      .from('change_orders')
      .insert({
        job_id: jobId,
        co_number: `CO-TEST-${Date.now()}`,
        title: 'Smoke test change order',
        status: 'submitted',
        type: 'additive',
        amount: 1250,
        created_by: user.id,
      })
      .select('id, client_token')
      .single()
    if (coErr || !co) throw new Error(`Failed to seed change order: ${coErr?.message}`)
    coId = co.id
    clientToken = co.client_token
  })

  test.afterAll(async () => {
    if (!admin) return
    await admin.from('change_orders').delete().eq('id', coId)
    await admin.from('jobs').delete().eq('id', jobId)
  })

  test('public CO page renders the seeded change order', async ({ page }) => {
    await page.goto(`/co/${clientToken}`)
    await expect(page.getByText('Smoke test change order')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve Change Order' })).toBeVisible()
  })

  test('approving flips status and stamps client_approved_at', async ({ page }) => {
    await page.goto(`/co/${clientToken}`)
    await page.getByRole('button', { name: 'Approve Change Order' }).click()
    await expect(page.getByText('Change Order Approved')).toBeVisible({ timeout: 15_000 })

    if (!admin) return
    const { data: co } = await admin
      .from('change_orders')
      .select('status, client_approved_at, approved_date')
      .eq('id', coId)
      .single()
    expect(co?.status).toBe('approved')
    expect(co?.client_approved_at).toBeTruthy()
    expect(co?.approved_date).toBeTruthy()
  })
})
