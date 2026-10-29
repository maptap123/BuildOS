import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium, type Page } from 'playwright'
import { compile } from '@tailwindcss/node'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function main() {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {HermesChatPanel} from './src/components/hermes/HermesChatPanel';
      createRoot(document.getElementById('root')).render(<HermesChatPanel/>);`,
      resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-boundaries', setup(b) {
      b.onResolve({filter: /^next\/navigation$/}, () => ({path: 'navigation', namespace: 'fixture'}))
      b.onResolve({filter: /lib\/supabase\/client$/}, () => ({path: 'auth', namespace: 'fixture'}))
      b.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({loader: 'js', contents: args.path === 'navigation'
        ? `export const usePathname=()=>'/jobs'; export const useRouter=()=>({push:()=>{}});`
        : `export const createClient=()=>({auth:{onAuthStateChange(cb){const fn=()=>cb('SIGNED_OUT',null); window.addEventListener('fixture-auth',fn); return {data:{subscription:{unsubscribe(){window.removeEventListener('fixture-auth',fn)}}}}}}});`}))
    }}],
  })
  const compiler = await compile(await readFile('src/app/globals.css', 'utf8'), {base:resolve('src/app'), onDependency(){}})
  const source = await readFile('src/components/hermes/HermesChatPanel.tsx','utf8')
  const css = compiler.build(source.split(/[\s"'`{}]+/))
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as {port:number}).port}`
  const browser = await chromium.launch({headless:true})
  let passed = 0
  async function scenario(name: string, run: (page: Page, state: State) => Promise<void>) {
    const page = await browser.newPage()
    await page.addInitScript('window.__name=(fn)=>fn')
    const state: State = { user: 'user-a', rows: [], sms: false, posts: [], polls: 0, profileOk: true }
    await page.route('**/api/me/profile', route => route.fulfill({status: state.profileOk ? 200 : 401, json: {id:state.user}}))
    await page.route('**/api/hermes/privacy-requests**', route => { state.polls++; return route.fulfill({json:state.rows}) })
    await page.route('**/api/hermes/chat', async route => {
      state.posts.push(route.request().postDataJSON())
      await route.fulfill({contentType:'text/event-stream', body: (state.events ?? [{type:'queued',requestId:'request-1',status:'queued',smsEnabled:state.sms},{type:'done',conversationId:'thread-a',requestId:'request-1'}]).map(event => `data: ${JSON.stringify(event)}\n\n`).join('')})
    })
    try { await page.goto(url); await page.getByLabel('Open Fixer AI').click(); await run(page,state); passed++; console.log(`PASS ${name}`) }
    finally { await page.close() }
  }
  try {
    await scenario('queued research may continue after close; no invented SMS promise', async (page,state) => {
      await page.getByPlaceholder('Ask Fixer…').fill('Research this job')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor({timeout:3000})
      assert.match(await page.locator('[role="dialog"]').innerText(), /saved here/)
      assert.doesNotMatch(await page.locator('[role="dialog"]').innerText(), /text you|SMS/)
      assert.equal(state.posts.length,1)
      assert.ok(state.polls > 0)
    })
    await scenario('completed research restores after reopen and reload exactly once, without caching private answers', async (page,state) => {
      await page.getByPlaceholder('Ask Fixer…').fill('Research this job')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      await page.getByLabel('Close chat', {exact:true}).click()
      state.rows = [{id:'request-1',status:'completed',created_at:'2026-10-28',result:'Authorized research answer'}]
      await page.getByLabel('Open Fixer AI').click()
      await page.getByText('Authorized research answer', {exact:true}).waitFor({timeout:6000})
      await page.waitForTimeout(3200)
      assert.equal(await page.getByText('Authorized research answer', {exact:true}).count(),1)
      await page.reload()
      await page.getByLabel('Open Fixer AI').click()
      await page.getByText('Authorized research answer', {exact:true}).waitFor()
      assert.equal(await page.getByText('Authorized research answer', {exact:true}).count(),1)
      const storage = await page.evaluate(() => JSON.stringify({...localStorage}))
      assert.doesNotMatch(storage,/Authorized research answer|Research this job/)
      assert.match(storage,/fixer.*user-a/)
    })
    await scenario('research statuses are human and never render held or denied result payloads', async (page,state) => {
      state.rows = [
        {id:'held',status:'held',result:'PRIVATE HELD ANSWER',progress:'INTERNAL TOOL TOKEN'},
        {id:'denied',status:'denied',result:'PRIVATE DENIED ANSWER'},
        {id:'expired',status:'expired'}, {id:'failed',status:'failed'},
        {id:'running',status:'running'}, {id:'cancelled',status:'cancelled'},
      ]
      await page.getByText('I need August’s approval before I can share that.', {exact:true}).waitFor({timeout:6000})
      const text = await page.locator('[role="dialog"]').innerText()
      for (const expected of ['August did not approve this request.', 'This request expired. Please ask again.', 'Research failed. Please try again.', 'Research in progress.', 'This request was cancelled.']) assert.ok(text.includes(expected),expected)
      assert.doesNotMatch(text,/PRIVATE|INTERNAL|TOOL TOKEN/)
    })
    await scenario('focus revalidates the signed-in account; no other account thread or answer is restored', async (page,state) => {
      state.rows = [{id:'a-private',status:'completed',result:'A PRIVATE ANSWER'}]
      await page.getByText('A PRIVATE ANSWER', {exact:true}).waitFor({timeout:6000})
      await page.getByPlaceholder('Ask Fixer…').fill('First user turn')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      state.user = 'user-b'; state.rows = []
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.waitForFunction(() => !document.body.innerText.includes('A PRIVATE ANSWER'), {timeout:4000})
      await page.getByPlaceholder('Ask Fixer…').fill('Second user turn')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      assert.equal(state.posts.length,2)
      assert.equal(state.posts[1].conversationId,undefined)
      assert.equal(state.posts[1].userId,undefined)
      assert.equal(state.posts[1].user_id,undefined)
      const storage = await page.evaluate(() => JSON.stringify({...localStorage}))
      assert.doesNotMatch(storage,/PRIVATE ANSWER|First user turn|Second user turn/)
    })
    await scenario('inline delta/done result and durable polling reconcile by requestId', async (page,state) => {
      state.events = [{type:'delta',text:'Inline authorized answer'}, {type:'done',requestId:'inline-1',conversationId:'inline-thread'}]
      await page.getByPlaceholder('Ask Fixer…').fill('Quick job question')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText('Inline authorized answer', {exact:true}).waitFor()
      state.rows = [{id:'inline-1',status:'completed',result:'Inline authorized answer'}]
      await page.waitForTimeout(3500)
      assert.equal(await page.getByText('Inline authorized answer', {exact:true}).count(),1)
    })
    await scenario('reopening the panel immediately refreshes saved research', async (page,state) => {
      await page.getByPlaceholder('Ask Fixer…').fill('Long research')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      await page.getByLabel('Close chat', {exact:true}).click()
      state.rows = [{id:'request-1',status:'completed',result:'Answer while closed'}]
      await page.getByLabel('Open Fixer AI').click()
      await page.getByText('Answer while closed', {exact:true}).waitFor({timeout:1000})
    })
    await scenario('interrupted SSE has a human error rather than an empty answer', async (page,state) => {
      state.events = [{type:'ping'}]
      await page.getByPlaceholder('Ask Fixer…').fill('Question interrupted')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText('Connection lost. Reopen Fixer to check saved research before trying again.', {exact:true}).waitFor({timeout:1000})
    })
    await scenario('thread metadata survives an immediate reload scoped to the authenticated user', async (page,state) => {
      await page.getByPlaceholder('Ask Fixer…').fill('First question')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      await page.reload()
      await page.getByLabel('Open Fixer AI').click()
      await page.getByPlaceholder('Ask Fixer…').fill('Follow up')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/You can close the app/).waitFor()
      assert.equal(state.posts[1].conversationId,'thread-a')
    })
    await scenario('slow status reads cannot overlap and reorder authorization state', async (page) => {
      let calls = 0
      let release!: () => void
      const wait = new Promise<void>(resolve => { release = resolve })
      await page.route('**/api/hermes/privacy-requests**', async route => { calls++; await wait; await route.fulfill({json:[]}).catch(()=>{}) })
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      try {
        await page.waitForTimeout(3500)
        assert.equal(calls,1)
      } finally { release() }
    })
    await scenario('auth changes discard late old-user reads and ignore unscoped answer caches', async (page,state) => {
      await page.evaluate(() => {
        localStorage.setItem('fixer-chat',JSON.stringify({messages:[{role:'assistant',content:'UNSCOPED PRIVATE CACHE'}]}))
        localStorage.setItem('buildos:fixer:user-b',JSON.stringify({conversationId:'thread-b',messages:[{content:'B CACHED PRIVATE ANSWER'}]}))
      })
      let release!: () => void
      let started!: () => void
      const waiting = new Promise<void>(resolve => { release=resolve })
      const requested = new Promise<void>(resolve => { started=resolve })
      let first = true
      await page.route('**/api/hermes/privacy-requests**', async route => {
        if (first) { first=false; started(); await waiting; await route.fulfill({json:[{id:'old',status:'completed',result:'LATE A PRIVATE ANSWER'}]}).catch(()=>{}); return }
        await route.fulfill({json:[{id:'new',status:'completed',result:'B AUTHORIZED ANSWER'}]})
      })
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await requested
      state.user='user-b'
      await page.evaluate(() => window.dispatchEvent(new Event('fixture-auth')))
      await page.getByText('B AUTHORIZED ANSWER', {exact:true}).waitFor()
      release()
      await page.waitForTimeout(150)
      assert.doesNotMatch(await page.locator('[role="dialog"]').innerText(), /LATE A|UNSCOPED|CACHED PRIVATE/)
    })
    await scenario('profile authentication failure disables chat without identity onboarding', async (page,state) => {
      state.profileOk=false
      await page.evaluate(() => window.dispatchEvent(new Event('fixture-auth')))
      await page.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement).disabled)
      assert.equal(state.posts.length,0)
      assert.doesNotMatch(await page.locator('[role="dialog"]').innerText(),/identify yourself|your phone|verify your identity/i)
    })
    await scenario('SMS acknowledgement is available only on a backend-enabled account', async (page,state) => {
      state.sms=true
      await page.getByPlaceholder('Ask Fixer…').fill('Research and update me')
      await page.getByLabel('Send message', {exact:true}).click()
      await page.getByText(/Text updates are enabled for your account/).waitFor()
      assert.doesNotMatch(await page.locator('[role="dialog"]').innerText(),/guaranteed|will text you/i)
    })
    await scenario('closed floating chrome is hidden to assistive technology; mobile reopen restores research', async (page,state) => {
      await page.setViewportSize({width:390,height:844})
      await page.getByLabel('Close chat', {exact:true}).click()
      assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-hidden'),'true')
      state.rows = [{id:'mobile',status:'completed',result:'Mobile saved answer'}]
      await page.getByLabel('Open Fixer AI').click()
      await page.getByText('Mobile saved answer', {exact:true}).waitFor()
      assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-hidden'),'false')
      const box = await page.locator('[role="dialog"]').boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390)
    })
  } finally { await browser.close(); server.close() }
  console.log(`PASSED ${passed} floating Fixer UI scenarios`)
}
interface State { user:string; rows:Record<string,unknown>[]; sms:boolean; posts:Record<string,unknown>[]; polls:number; profileOk:boolean; events?:Record<string,unknown>[] }
main().catch(e=>{console.error(e);process.exitCode=1})
