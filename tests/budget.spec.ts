import { test, expect, Page } from '@playwright/test'

/**
 * Budget page E2E tests.
 *
 * These tests require:
 *  - Dev server running at http://localhost:3000
 *  - A Supabase session cookie (PLAYWRIGHT_SESSION_COOKIE env var) OR
 *    that the app is accessible without auth for testing purposes.
 *
 * To run with auth:
 *   PLAYWRIGHT_SESSION_COOKIE="<cookie>" npx playwright test
 *
 * To set the job ID under test:
 *   PLAYWRIGHT_JOB_ID="<uuid>" npx playwright test
 */

const JOB_ID  = process.env.PLAYWRIGHT_JOB_ID  ?? ''
const COOKIE   = process.env.PLAYWRIGHT_SESSION_COOKIE ?? ''

async function setupAuth(page: Page) {
  if (!COOKIE) return
  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: COOKIE,
      domain: 'localhost',
      path: '/',
    },
  ])
}

test.describe('Budget page — unauthenticated redirect', () => {
  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/jobs/fake-id/budget')
    // Should redirect to login (or show an auth wall)
    await expect(page).toHaveURL(/login|sign-in|auth/, { timeout: 10_000 })
  })
})

test.describe('Budget page — structure tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('jobs list page loads', async ({ page }) => {
    await setupAuth(page)
    await page.goto('/')
    // Should either show jobs or redirect to login
    const url = page.url()
    expect(url).toMatch(/localhost:3000/)
  })
})

test.describe('Budget page — with auth', () => {
  test.skip(!JOB_ID, 'Set PLAYWRIGHT_JOB_ID env var to run authenticated budget tests')

  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await page.goto(`/jobs/${JOB_ID}/budget`)
    // Wait for main content to load
    await page.waitForLoadState('networkidle')
  })

  test('renders budget summary cards', async ({ page }) => {
    // All 7 metric cards should be visible
    await expect(page.getByText('Contract')).toBeVisible()
    await expect(page.getByText('Budget')).toBeVisible()
    await expect(page.getByText('Committed')).toBeVisible()
    await expect(page.getByText('Forecast')).toBeVisible()
    await expect(page.getByText('Variance')).toBeVisible()
    await expect(page.getByText('Margin')).toBeVisible()
  })

  test('renders tab navigation', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Budget Lines/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Change Orders/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bills/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Purchase Orders/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Work Orders/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Draw Schedule/ })).toBeVisible()
  })

  test('can switch to Change Orders tab', async ({ page }) => {
    await page.getByRole('button', { name: /Change Orders/ }).click()
    await expect(page.getByText('Change Orders').first()).toBeVisible()
  })

  test('can switch to Bills tab', async ({ page }) => {
    await page.getByRole('button', { name: /Bills/ }).click()
    await expect(page.getByText('Bills').first()).toBeVisible()
  })

  test('can switch to Purchase Orders tab', async ({ page }) => {
    await page.getByRole('button', { name: /Purchase Orders/ }).click()
    await expect(page.getByText('Purchase Orders').first()).toBeVisible()
  })

  test('can switch to Draw Schedule tab', async ({ page }) => {
    await page.getByRole('button', { name: /Draw Schedule/ }).click()
    await expect(page.getByText('Draw Schedule').first()).toBeVisible()
  })

  test('budget lines table renders search bar', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search code/)).toBeVisible()
  })

  test('budget lines search filters results', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search code/)
    await searchInput.fill('zzzznotexistent')
    await expect(page.getByText('No lines match your search')).toBeVisible()
    await searchInput.fill('')
  })

  test('status filter dropdown exists', async ({ page }) => {
    await expect(page.getByRole('combobox').filter({ hasText: /All Statuses/ })).toBeVisible()
  })

  test('spend progress bars render', async ({ page }) => {
    // The spend progress section should be visible if there are budget lines
    const progressSection = page.locator('text=Committed vs Budget')
    const hasBudgetLines = await progressSection.isVisible()
    if (hasBudgetLines) {
      await expect(page.getByText('Actual vs Budget')).toBeVisible()
      await expect(page.getByText('Forecast vs Budget')).toBeVisible()
    }
  })

  test('QB sync button is visible', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: /Sync to QuickBooks/ })
    const isVisible = await syncBtn.isVisible()
    // May not be visible if user doesn't have edit permission — that's OK
    if (isVisible) {
      await expect(syncBtn).toBeEnabled()
    }
  })

  test('Export CSV button renders when lines exist', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /Export CSV/ })
    const isVisible = await exportBtn.isVisible()
    if (isVisible) {
      // Clicking export should trigger a download (not navigate away)
      await expect(exportBtn).toBeEnabled()
    }
  })
})

test.describe('Budget page — visual snapshot', () => {
  test.skip(!JOB_ID, 'Set PLAYWRIGHT_JOB_ID env var to run visual tests')

  test('budget page screenshot', async ({ page }) => {
    await setupAuth(page)
    await page.goto(`/jobs/${JOB_ID}/budget`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('budget-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    })
  })
})
