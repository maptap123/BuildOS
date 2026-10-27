/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UI tests for DeleteEstimateButton.
 *
 * Approach:
 *   1. esbuild bundles the component (React + mocked next/navigation + lucide-react)
 *   2. A fixture HTML file renders it with in-memory mock fetch
 *   3. A local HTTP server serves the fixture
 *   4. Playwright drives the browser through each scenario
 *
 * Tests:
 *   - cancel: clicking Cancel does not send a DELETE request
 *   - error: server error keeps modal open with error message
 *   - version label: modal always shows "Version N" separately
 *   - duplicate click: second confirm click while in-flight is ignored (only 1 request)
 *   - success → callback: 204 closes modal, calls onDeleted, calls router.refresh
 *   - disabled: disabled prop disables the trigger button
 */

import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// ─── Build component bundle ───────────────────────────────────────────────────
async function buildBundle(): Promise<string> {
  const compiled = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { DeleteEstimateButton } from './src/components/estimates/DeleteEstimateButton'

        window.__mountDeleteButton = function(props) {
          const el = document.getElementById('root')
          createRoot(el).render(React.createElement(DeleteEstimateButton, props))
        }
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [{
      name: 'mock-next-navigation',
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'next-navigation-mock',
          namespace: 'test-mock',
        }))
        b.onLoad({ filter: /.*/, namespace: 'test-mock' }, () => ({
          contents: `
            export function useRouter() {
              return { refresh: () => { window.__routerRefreshCalled = true } }
            }
          `,
          loader: 'js',
        }))
      },
    }],
  })
  return compiled.outputFiles[0].text
}

// ─── Build fixture HTML ───────────────────────────────────────────────────────
function buildFixture(bundleJs: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DeleteEstimateButton Test Fixture</title>

</head>
<body>
  <div id="root"></div>
  <script>
    window.__mockFetchResponse = null
    window.__fetchCallCount = 0
    window.__fetchDelayMs = 0
    window.__routerRefreshCalled = false
    window.__onDeletedCalled = false
    window.__onDeletedId = null

    window.fetch = async function(url, opts) {
      window.__fetchCallCount++
      if (window.__fetchDelayMs > 0) {
        await new Promise(r => setTimeout(r, window.__fetchDelayMs))
      }
      const { status, body } = window.__mockFetchResponse
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body ?? {},
      }
    }
  </script>
  <script>
    ${bundleJs}
  </script>
  <script>
    window.mountButton = function(opts) {
      opts = opts || {}
      window.__fetchCallCount = 0
      window.__routerRefreshCalled = false
      window.__onDeletedCalled = false
      window.__onDeletedId = null
      window.__mountDeleteButton({
        estimate: opts.estimate || { id: 'est-abc', title: 'Kitchen Remodel', version: 3 },
        disabled: opts.disabled || false,
        onDeleted: function(id) {
          window.__onDeletedCalled = true
          window.__onDeletedId = id
        },
      })
    }
  </script>
</body>
</html>`
}

// ─── Start HTTP server ────────────────────────────────────────────────────────
async function startServer(html: string): Promise<{ url: string; close: () => void }> {
  return new Promise((res) => {
    const srv = createServer((_req, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(html)
    })
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number }
      res({ url: `http://127.0.0.1:${addr.port}`, close: () => srv.close() })
    })
  })
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++ }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`); failed++ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nDeleteEstimateButton — UI tests')

  await mkdir('.playwright-mcp', { recursive: true })
  const bundleJs = await buildBundle()
  const html = buildFixture(bundleJs)
  await writeFile(resolve('.playwright-mcp/delete-button-fixture.html'), html)

  const { url, close: closeServer } = await startServer(html)
  const browser = await chromium.launch({ headless: true })
  const ctx     = await browser.newContext()

  try {
    await test('cancel: no DELETE request sent', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 204, body: null }
        w.mountButton({})
      })
      await page.click('button[title="Delete this estimate"]')
      await page.waitForSelector('[role="dialog"]')
      await page.click('button:text("Cancel")')
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' })
      const count = await page.evaluate(() => (window as any).__fetchCallCount)
      assert.equal(count, 0, 'Cancel must not call fetch')
      await page.close()
    })

    await test('error: server error keeps modal open with message', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 422, body: { error: 'Estimate is locked.' } }
        w.mountButton({})
      })
      await page.click('button[title="Delete this estimate"]')
      await page.waitForSelector('[role="dialog"]')
      await page.click('button:text("Delete Estimate")')
      await page.waitForSelector('text="Estimate is locked."')
      const dialogVisible = await page.isVisible('[role="dialog"]')
      assert.ok(dialogVisible, 'Modal must remain open on error')
      await page.close()
    })

    await test('version label: modal always shows "Version N" separately', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 204, body: null }
        w.mountButton({ estimate: { id: 'e1', title: 'Garage Addition', version: 5 } })
      })
      await page.click('button[title="Delete this estimate"]')
      await page.waitForSelector('[role="dialog"]')
      const versionText = await page.isVisible('text="Version 5"')
      assert.ok(versionText, 'Version N label must appear even when title is present')
      await page.close()
    })

    await test('duplicate click: only one DELETE request sent', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 204, body: null }
        w.__fetchDelayMs = 300
        w.mountButton({})
      })
      await page.click('button[title="Delete this estimate"]')
      await page.waitForSelector('[role="dialog"]')
      // Trigger two synchronous clicks before React re-renders —
      // inFlight ref must block the second from sending a request.
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')!
        const btns = dialog.querySelectorAll('button')
        const confirmBtn = btns[btns.length - 1] as HTMLButtonElement
        confirmBtn.click()
        confirmBtn.click()
      })
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 })
      const count = await page.evaluate(() => (window as any).__fetchCallCount)
      assert.equal(count, 1, 'Should only send one DELETE request despite rapid double-click')
      await page.close()
    })

    await test('success: closes modal, calls onDeleted, calls router.refresh', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 204, body: null }
        w.__fetchDelayMs = 0
        w.mountButton({ estimate: { id: 'est-xyz', title: 'Deck Build', version: 1 } })
      })
      await page.click('button[title="Delete this estimate"]')
      await page.waitForSelector('[role="dialog"]')
      await page.click('button:text("Delete Estimate")')
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 2000 })
      const result = await page.evaluate(() => {
        const w = window as any
        return { onDeletedCalled: w.__onDeletedCalled, onDeletedId: w.__onDeletedId, routerRefreshed: w.__routerRefreshCalled }
      })
      assert.ok(result.onDeletedCalled, 'onDeleted callback must have been called')
      assert.equal(result.onDeletedId, 'est-xyz', 'onDeleted must receive the estimate id')
      assert.ok(result.routerRefreshed, 'router.refresh() must have been called')
      await page.close()
    })

    await test('disabled: trigger button is disabled when disabled prop is true', async () => {
      const page = await ctx.newPage()
      await page.goto(url)
      await page.evaluate(() => {
        const w = window as any
        w.__mockFetchResponse = { status: 204, body: null }
        w.mountButton({ disabled: true })
      })
      const isDisabled = await page.evaluate(() =>
        (document.querySelector('button[title="Delete this estimate"]') as HTMLButtonElement)?.disabled
      )
      assert.ok(isDisabled, 'Trigger button must be disabled when disabled prop is true')
      await page.close()
    })
  } finally {
    await browser.close()
    closeServer()
  }

  console.log('')
  if (failed > 0) { console.error(`FAILED ${failed}/${failed + passed}`); process.exit(1) }
  else console.log(`PASSED ${passed}/${passed}`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
