import { test, expect } from '@playwright/test'
import { adminClient } from './helpers/supabase-admin'

/**
 * Money path 3/3: bill (actual) entry → approve → budget impact visible.
 *
 * Unlike the proposal-accept and change-order-sign paths, this one is an
 * OFFICE-authenticated action (Budget → Bills tab → Approve) — there's no
 * public token route. Following the existing tests/budget.spec.ts convention:
 * requires PLAYWRIGHT_SESSION_COOKIE (a real logged-in session cookie) to run
 * for real; otherwise skipped. This project has no scripted way to mint a
 * valid Supabase session without an interactive login, so — same as
 * budget.spec.ts — a human needs to log in once and export the cookie to run
 * this for real.
 *
 * To run for real:
 *   PLAYWRIGHT_SESSION_COOKIE="<cookie>" npx playwright test money-path-bill-approve
 */

const admin = adminClient()
const COOKIE = process.env.PLAYWRIGHT_SESSION_COOKIE ?? ''

test.describe('Money path: bill approve', () => {
  test.skip(!admin || !COOKIE, 'Requires SUPABASE_SERVICE_ROLE_KEY (seeding) and PLAYWRIGHT_SESSION_COOKIE (a real login session)')

  let jobId: string
  let actualId: string

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

    const { data: actual, error: actualErr } = await admin
      .from('actuals')
      .insert({
        job_id: jobId,
        description: 'Smoke test bill',
        amount: 375.5,
        incurred_date: new Date().toISOString().slice(0, 10),
        vendor_name: 'Smoke Test Vendor',
        status: 'pending',
        created_by: user.id,
      })
      .select('id')
      .single()
    if (actualErr || !actual) throw new Error(`Failed to seed actual: ${actualErr?.message}`)
    actualId = actual.id
  })

  test.afterAll(async () => {
    if (!admin) return
    await admin.from('actuals').delete().eq('id', actualId)
    await admin.from('jobs').delete().eq('id', jobId)
  })

  test('approving a pending bill stamps approved_by/approved_at', async ({ page }) => {
    await page.context().addCookies([{ name: 'sb-access-token', value: COOKIE, domain: 'localhost', path: '/' }])
    await page.goto(`/jobs/${jobId}/budget`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Bills/ }).click()
    await expect(page.getByText('Smoke test bill')).toBeVisible()

    await page.getByRole('button', { name: 'Approve' }).first().click()
    await expect(page.getByText('Approved').first()).toBeVisible({ timeout: 10_000 })

    if (!admin) return
    const { data: actual } = await admin.from('actuals').select('status, approved_by, approved_at').eq('id', actualId).single()
    expect(actual?.status).toBe('approved')
    expect(actual?.approved_by).toBeTruthy()
    expect(actual?.approved_at).toBeTruthy()
  })
})
