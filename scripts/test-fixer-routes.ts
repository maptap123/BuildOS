import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Row = Record<string, unknown>
class Query {
  columns = '*'
  constructor(public rows: Row[]) {}
  select(columns = '*') { this.columns = columns; return this }
  eq(key: string, value: unknown) { this.rows = this.rows.filter(r => r[key] === value); return this }
  in(key: string, values: unknown[]) { this.rows = this.rows.filter(r => values.includes(r[key])); return this }
  gt(key: string, value: string) { this.rows = this.rows.filter(r => String(r[key]) > value); return this }
  order() { return this }
  result() { return this.rows.map(r => this.columns === '*' ? r : Object.fromEntries(this.columns.split(',').map(k => [k, r[k]]))) }
  async single() { return { data: this.result()[0] ?? null, error: null } }
  async maybeSingle() { return this.single() }
  then<T>(callback: (result: { data: Row[]; error: null }) => T) { return Promise.resolve(callback({ data: this.result(), error: null })) }
}

async function main() {
  const uid = '10000000-0000-4000-8000-000000000001', eid = '20000000-0000-4000-8000-000000000001'
  const id = '30000000-0000-4000-8000-000000000001', lease = '40000000-0000-4000-8000-000000000001'
  const state = { user: null as { id: string } | null, tables: {} as Record<string, Row[]>, calls: [] as { name: string; args: Row }[] }
  const admin = {
    from: (table: string) => new Query([...(state.tables[table] ?? [])]),
    rpc: async (name: string, args: Row = {}) => { state.calls.push({ name, args }); return { data: name === 'enqueue_fixer_request' ? { id: args.p_id, status: 'queued' } : null, error: null } },
  }
  const globals = globalThis as unknown as { __fixerRouteTest: { admin: typeof admin; getUser: () => { data: { user: typeof state.user } } } }
  globals.__fixerRouteTest = { admin, getUser: () => ({ data: { user: state.user } }) }
  const compiled = await build({ stdin: { contents: `export * as requests from './src/app/api/hermes/requests/route'; export * as worker from './src/app/api/hermes/worker/route'; export * as agent from './src/app/api/agent/route';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'test-auth-and-database', setup(build) {
      build.onResolve({ filter: /lib\/supabase\/(admin|server)$/ }, args => ({ path: args.path.endsWith('/admin') ? 'admin' : 'server', namespace: 'test-db' }))
      build.onLoad({ filter: /.*/, namespace: 'test-db' }, args => ({ contents: args.path === 'admin'
        ? 'export function createAdminClient(){ return globalThis.__fixerRouteTest.admin }'
        : 'export async function createClient(){ return {auth:{getUser:async()=>globalThis.__fixerRouteTest.getUser()}} }', loader: 'js' }))
    } }],
  })
  await mkdir('.playwright-mcp', { recursive: true })
  const file = resolve('.playwright-mcp/fixer-route-tests.cjs')
  await writeFile(file, compiled.outputFiles[0].text)
  const routes = createRequire(import.meta.url)(file) as Record<string, Record<string, (r: Request) => Promise<Response>>>
  const get = () => new Request(`https://buildos.test/api/hermes/requests?estimate_id=${eid}`)
  const post = (body: Row, token?: string) => new Request('https://buildos.test/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  assert.equal((await routes.requests.GET(get())).status, 401)
  state.user = { id: uid }
  state.tables.users = [{ id: uid, is_active: true }]
  assert.equal((await routes.requests.GET(get())).status, 403)
  state.tables.user_permissions = [{ user_id: uid, module: 'ai', can_view: true }, { user_id: uid, module: 'budget', can_view: true, can_create: true }]
  state.tables.fixer_requests = [
    { id, user_id: uid, estimate_id: eid, message: 'Own question', status: 'completed', lease_token: 'SECRET' },
    { id: 'another', user_id: 'other-user', estimate_id: eid, message: 'Private question' },
    { id: 'third', user_id: uid, estimate_id: 'other-estimate', message: 'Other estimate' },
  ]
  const history = await (await routes.requests.GET(get())).json()
  assert.equal(history.length, 1)
  assert.equal(history[0].message, 'Own question')
  assert.equal(history[0].lease_token, undefined)
  assert.equal((await routes.requests.POST(post({ id, estimate_id: eid, message: 'Different question' }))).status, 409)
  assert.equal((await routes.requests.POST(post({ id, estimate_id: eid, message: 'Own question' }))).status, 200)
  state.tables.fixer_requests = []
  assert.equal((await routes.requests.POST(post({ id, estimate_id: eid, message: 'New question' }))).status, 503)
  assert.equal(state.calls.filter(c => c.name === 'enqueue_fixer_request').length, 0)
  process.env.FIXER_BACKGROUND_ENABLED = 'true'
  state.tables.fixer_worker_health = [{ id: 'hermes', seen_at: new Date().toISOString() }]
  assert.equal((await routes.requests.POST(post({ id, estimate_id: eid, message: 'New question', user_id: 'attacker-chosen' }))).status, 202)
  assert.equal(state.calls.find(c => c.name === 'enqueue_fixer_request')?.args.p_user, uid)
  assert.equal((await routes.worker.POST(post({ action: 'claim' }, 'wrong'))).status, 401)
  const token = `fixer.${id}.${lease}`
  assert.equal((await routes.agent.POST(post({ tool: 'add_estimate_lines', params: { estimate_id: eid, lines: [] } }, token))).status, 403)
  state.tables.fixer_requests = [{ id, user_id: uid, estimate_id: eid, lease_token: lease, status: 'running', lease_until: new Date(Date.now() + 60000).toISOString(), deadline: new Date(Date.now() + 120000).toISOString() }]
  assert.equal((await routes.agent.POST(post({ tool: 'create_task' }, token))).status, 403)
  assert.equal((await routes.agent.POST(post({ tool: 'add_estimate_lines', params: { estimate_id: 'another-estimate', lines: [] } }, token))).status, 403)
  assert.equal((await routes.agent.POST(post({ tool: 'add_estimate_lines', params: { estimate_id: eid, lines: [] } }, token))).status, 400)
  state.tables.users[0].is_active = false
  assert.equal((await routes.agent.POST(post({ tool: 'find_line_pricing', params: { item: 'Framing' } }, token))).status, 403)
  delete process.env.FIXER_BACKGROUND_ENABLED
  console.log('PASS: actual routes enforce auth, user/estimate isolation, secret filtering, idempotency, worker readiness, scoped tools and revoked access')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
