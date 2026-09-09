// Loopback-only browser fixture. Uses the actual panel/hook and actual queue RPCs;
// authentication and Hermes inference are test doubles. Never part of Next routes.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { compile } from '@tailwindcss/node'
import { resolve } from 'node:path'
import { createFixerTestDb } from './fixer-test-db'

const user = '10000000-0000-4000-8000-000000000001'
const estimate = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'

async function main() {
  const db = await createFixerTestDb()
  await db.query('insert into users values($1)', [user])
  await db.query('insert into estimates(id,lead_id) values($1,$3),($2,$3)', [estimate, other, user])
  const script = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EstimateFixerPanel} from './src/components/estimates/EstimateFixerPanel';
    const estimateId = new URLSearchParams(location.search).get('estimate') || '${estimate}';
    createRoot(document.getElementById('root')).render(<EstimateFixerPanel key={estimateId}
      estimateId={estimateId} scopeText="Frame an addition" canCreate={true} isLocked={false}
      seedDraft={null} onSeedConsumed={()=>{}} onLinesChanged={()=>{}} />);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
  const cssCompiler = await compile(await readFile('src/app/globals.css', 'utf8'), { base: resolve('src/app'), onDependency: () => {} })
  const component = await readFile('src/components/estimates/EstimateFixerPanel.tsx', 'utf8')
  const css = cssCompiler.build(component.split(/[\s"'`{}]+/))
  const scalar = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ value: T }>(sql, args)).rows[0]?.value
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const json = (data: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    try {
      let text = ''
      for await (const chunk of request) text += chunk
      const body = text ? JSON.parse(text) : {}
      if (url.pathname === '/bundle.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(script.outputFiles[0].text); return }
      if (url.pathname === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); return }
      if (url.pathname === '/api/hermes/requests') {
        if (request.method === 'POST') {
          json(await scalar('select enqueue_fixer_request($1,$2,$3,$4) as value', [body.id, user, body.estimate_id, body.message]), 202)
        } else {
          json((await db.query('select * from fixer_requests where user_id=$1 and estimate_id=$2 order by created_at', [user, url.searchParams.get('estimate_id')])).rows)
        }
        return
      }
      if (url.pathname === '/api/estimate-lines/proposals') {
        if (request.method === 'POST') json(await scalar('select apply_estimate_proposals($1,$2) as value', [body.proposal_ids, user]))
        else json((await db.query("select * from estimate_line_proposals where estimate_id=$1 and status='pending'", [url.searchParams.get('estimate_id')])).rows)
        return
      }
      if (url.pathname === '/test/status') {
        json({ requests: (await db.query('select id,message,status from fixer_requests')).rows, lines: (await db.query('select id from estimate_lines')).rows })
        return
      }
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Fixer recovery verification</title><link rel="stylesheet" href="/style.css"></head><body><main style="max-width:600px;margin:40px auto"><h1>Estimate Fixer — test fixture</h1><div id="root"></div></main><script src="/bundle.js"></script></body></html>')
    } catch { json({ error: 'Fixture request failed' }, 409) }
  })
  // Simulated model worker, scheduled independently of all browser requests.
  // The queue, stage and completion transactions are the production SQL functions.
  let busy = false
  setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const job = await scalar<{ id: string; message: string; lease_token: string }>('select claim_fixer_request() as value')
      if (!job) return
      await new Promise(resolve => setTimeout(resolve, 2500))
      if (job.message.includes('fail')) {
        await scalar('select update_fixer_request($1,$2,$3,$4) as value', [job.id, job.lease_token, 'fail', 'Fixer worker restarted. Review proposed lines before trying again.'])
      } else {
        const lines = [{ description: 'Framing labor and material', name_status: 'sourced', phase: 'Framing', uom: 'EA', quantity: 2, unit_cost: 30, labor_cost: 10, material_cost: 15, sub_cost: 5, markup_pct: 10, sort_order: 0, source: 'ai_comp', comp_label: 'Historical JDC addition' }]
        await scalar('select stage_fixer_lines($1,$2,$3,$4::jsonb) as value', [job.id, job.lease_token, 'fixture', JSON.stringify(lines)])
        await scalar('select update_fixer_request($1,$2,$3,$4) as value', [job.id, job.lease_token, 'complete', 'I found comparable JDC framing. The proposed lines are saved for your review.'])
      }
    } finally { busy = false }
  }, 200)
  server.listen(4317, '127.0.0.1', () => console.log('Fixer test fixture ready at http://127.0.0.1:4317'))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
