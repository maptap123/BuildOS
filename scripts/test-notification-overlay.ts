// Isolated browser regression: real NotificationBell + Tailwind, synthetic API only.
// No login, live notifications, database writes, or production server required.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { chromium, expect } from '@playwright/test'

async function main() {
  const source = await readFile('src/components/notifications/NotificationBell.tsx', 'utf8')
  const fixture = `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {NotificationBell} from './src/components/notifications/NotificationBell';
    createRoot(document.getElementById('root')).render(<>
      <nav style={{display:'flex',justifyContent:'flex-end',height:48,overflowX:'auto',transform:'translateZ(0)',position:'relative',zIndex:1}}>
        <NotificationBell variant={innerWidth < 768 ? 'dark' : 'light'} />
      </nav>
      <div style={{position:'fixed',inset:'48px 0 0',zIndex:2147483647,background:'#dce4ef'}}>Application window / page content</div>
    </>);
  `
  const bundled = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'navigation-fixture', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRouter = () => ({push: path => {window.__notificationNavigation = path}})' }))
  } }] })
  const tailwind = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency() {} })
  const css = tailwind.build([...new Set(source.split(/[\s"'`{}]+/))])
  const patches: unknown[] = []
  const notification = { id: 'notification-fixture', title: 'Overlay regression notification', body: 'Synthetic browser-test notification', created_at: new Date().toISOString(), read_at: null, link: '/jobs/test-job/logs' }
  const server = createServer(async (req, res) => {
    if (req.url === '/api/notifications') {
      if (req.method === 'PATCH') {
        let body = ''; for await (const chunk of req) body += chunk
        patches.push(JSON.parse(body))
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ notifications: [notification], unreadCount: 1 })); return
    }
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); return }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert(address && typeof address !== 'string')
  const browser = await chromium.launch()
  const errors: string[] = []
  try {
    await mkdir('.playwright-mcp', { recursive: true })
    for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844], ['short-mobile', 320, 240]] as const) {
      patches.length = 0
      const page = await browser.newPage({ viewport: { width, height } })
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(`http://127.0.0.1:${address.port}`)
      const bell = page.getByRole('button', { name: 'Notifications', exact: true })
      await bell.click()
      const item = page.getByRole('button', { name: /Overlay regression notification/ })
      await expect(item).toBeVisible()
      // toBeVisible alone does NOT detect clipping or another window covering it.
      const box = await item.boundingBox(); assert(box)
      assert(await item.evaluate(el => {
        const r = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
      }), `${name}: notification is clipped or covered by application content`)
      assert(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${name}: panel outside viewport`)
      await page.screenshot({ path: `.playwright-mcp/notification-overlay-${name}.png` })
      await expect(bell).toHaveAttribute('aria-expanded', 'true')
      await page.getByRole('button', { name: 'Mark all read' }).click()
      await expect.poll(() => patches.some(p => (p as { all?: boolean }).all)).toBe(true)
      await expect(item).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(item).toBeHidden()
      await expect(bell).toHaveAttribute('aria-expanded', 'false')
      await bell.click(); await expect(item).toBeVisible()
      await page.mouse.click(10, height - 5); await expect(item).toBeHidden()
      await bell.click(); await expect(item).toBeVisible()
      await bell.click(); await expect(item).toBeHidden()
      await bell.focus(); await page.keyboard.press('Enter'); await expect(item).toBeVisible()
      await page.setViewportSize({ width: width + 30, height })
      await item.click()
      await expect.poll(() => page.evaluate(() => (window as unknown as { __notificationNavigation?: string }).__notificationNavigation)).toBe('/jobs/test-job/logs')
      await expect(item).toBeHidden()
      await page.close()
      console.log(`PASS ${name}: above clipped/transformed nav and maximum-z-index window; viewport fit; mark-read, Escape, outside click, toggle, keyboard, resize and navigation`)
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
