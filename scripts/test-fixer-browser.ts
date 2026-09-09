import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

async function main() {
  const origin = 'http://127.0.0.1:4317'
  let browser = await chromium.launch()
  let page = await browser.newPage()
  try {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin)
  await expect(page.getByPlaceholder('Ask Fixer to price something…')).toBeEnabled()
  const message = `Frame addition ${Date.now()}`
  await page.getByPlaceholder('Ask Fixer to price something…').fill(message)
  await page.getByRole('button', { name: 'Send to Fixer' }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await browser.close() // No page, browser context, or open connection remains.
  await expect.poll(async () => (await (await fetch(origin + '/test/status')).json()).requests.find((r: { message: string }) => r.message === message)?.status).toBe('completed')
  browser = await chromium.launch()
  page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin)
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await expect(page.getByText('I found comparable JDC framing. The proposed lines are saved for your review.', { exact: true })).toBeVisible()
  await expect(page.getByText('Framing labor and material', { exact: true })).toBeVisible()
  assert.equal((await (await fetch(origin + '/test/status')).json()).lines.length, 0)
  await page.screenshot({ path: '.playwright-mcp/fixer-recovered.png', fullPage: true })
  await page.getByRole('button', { name: /Add checked/i }).click()
  await expect.poll(async () => (await (await fetch(origin + '/test/status')).json()).lines.length).toBe(1)
  await page.goto(origin + '?estimate=20000000-0000-4000-8000-000000000002')
  await expect(page.getByPlaceholder('Ask Fixer to price something…')).toBeEnabled()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  await page.getByPlaceholder('Ask Fixer to price something…').fill('Please fail this test request')
  await page.getByRole('button', { name: 'Send to Fixer' }).click()
  await expect(page.getByText('Please fail this test request', { exact: true })).toBeVisible()
  await browser.close()
  await expect.poll(async () => (await (await fetch(origin + '/test/status')).json()).requests.find((r: { message: string }) => r.message === 'Please fail this test request')?.status).toBe('failed')
  browser = await chromium.launch()
  page = await browser.newPage()
  await page.goto(origin + '?estimate=20000000-0000-4000-8000-000000000002')
  await expect(page.getByText('Fixer worker restarted. Review proposed lines before trying again.', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Ask Fixer to price something…')).toBeEnabled()
  assert.deepEqual(errors, [])
  await browser.close()
  } finally { await browser.close() }
  console.log('PASS: real panel closes/reopens in fresh browser; saved question, answer, proposed lines, approval, estimate isolation and failure recovery')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
