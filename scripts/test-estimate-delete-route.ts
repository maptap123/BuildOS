/**
 * Integration tests for DELETE /api/estimates/[id].
 * Bundles the actual route with mocked auth/admin; no real DB.
 *
 * Covers: auth, permission resolution (estimates-module priority),
 * estimate state guards, budget import reference, fixer active request,
 * DB errors, concurrent state change (0 rows), and success.
 */

import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// ─── Minimal query builder ────────────────────────────────────────────────────
type Row = Record<string, unknown>

class Query {
  private _columns = '*'
  private _filters: ((r: Row) => boolean)[] = []
  private _isDelete = false
  private _limit: number | undefined

  constructor(
    private rows: Row[],
    private tableName: string,
    private state: State,
  ) {}

  select(cols = '*') { this._columns = cols; return this }
  eq(key: string, val: unknown)  { this._filters.push(r => r[key] === val); return this }
  is(key: string, val: unknown)  {
    if (val === null) this._filters.push(r => r[key] == null)
    else this._filters.push(r => r[key] === val)
    return this
  }
  neq(key: string, val: unknown) { this._filters.push(r => r[key] !== val); return this }
  in(key: string, vals: unknown[]) { this._filters.push(r => vals.includes(r[key])); return this }
  like(key: string, pat: string) {
    const re = new RegExp('^' + pat.replace(/%/g, '.*') + '$')
    this._filters.push(r => re.test(String(r[key] ?? '')))
    return this
  }
  order() { return this }
  lt()    { return this }
  limit(n: number) { this._limit = n; return this }
  delete() { this._isDelete = true; return this }

  private matched() {
    let rows = this.rows.filter(r => this._filters.every(f => f(r)))
    if (this._limit !== undefined) rows = rows.slice(0, this._limit)
    return rows
  }
  private result() {
    return this.matched().map(r =>
      this._columns === '*' ? r
        : Object.fromEntries(this._columns.split(',').map(k => [k.trim(), r[k.trim()]]))
    )
  }

  async single() {
    if (this.state.permQueryError && this.tableName === 'user_permissions') {
      return { data: null, error: { message: 'db connection failed' } }
    }
    if (this.state.estimateQueryError && this.tableName === 'estimates' && !this._isDelete) {
      return { data: null, error: { message: 'db connection failed' } }
    }
    const data = this.result()[0] ?? null
    const error = data ? null : { code: 'PGRST116', message: 'no rows' }
    return { data, error }
  }
  async maybeSingle() {
    if (this.state.permQueryError && this.tableName === 'user_permissions') {
      return { data: null, error: { message: 'db connection failed' } }
    }
    if (this.state.estimateQueryError && this.tableName === 'estimates' && !this._isDelete) {
      return { data: null, error: { message: 'db connection failed' } }
    }
    return { data: this.result()[0] ?? null, error: null }
  }
  // Called when route uses `await admin.from(...).select()...` as a Promise
  then<T>(resolve: (r: { data: Row[]; error: null | { message: string } }) => T) {
    if (this._isDelete) {
      if (this.state.deleteQueryError) {
        return Promise.resolve(resolve({ data: null as unknown as Row[], error: { message: 'delete failed' } }))
      }
      if (this.state.deleteRowCount !== undefined) {
        const fakeRows = Array.from({ length: this.state.deleteRowCount }, () => ({ id: 'del' }))
        return Promise.resolve(resolve({ data: fakeRows, error: null }))
      }
      const matched = this.matched()
      // Remove from state
      this.state.tables[this.tableName] = this.rows.filter(r => !matched.includes(r))
      return Promise.resolve(resolve({ data: matched, error: null }))
    }
    return Promise.resolve(resolve({ data: this.result(), error: null }))
  }
}

interface State {
  user: { id: string } | null
  tables: Record<string, Row[]>
  permQueryError: boolean
  estimateQueryError: boolean
  deleteQueryError: boolean
  deleteRowCount: number | undefined
}

function makeAdmin(state: State) {
  return {
    from: (table: string) => new Query([...(state.tables[table] ?? [])], table, state),
  }
}

// ─── Build route ──────────────────────────────────────────────────────────────
async function buildRoute() {
  const compiled = await build({
    stdin: {
      contents: `export * as route from './src/app/api/estimates/[id]/route'`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [{
      name: 'test-db',
      setup(b) {
        b.onResolve({ filter: /lib\/supabase\/(admin|server)$/ }, args => ({
          path: args.path.endsWith('/admin') ? 'admin' : 'server',
          namespace: 'test-db',
        }))
        b.onLoad({ filter: /.*/, namespace: 'test-db' }, args => ({
          contents: args.path === 'admin'
            ? 'export function createAdminClient(){ return globalThis.__delRouteTest.admin }'
            : 'export async function createClient(){ return { auth: { getUser: async () => globalThis.__delRouteTest.getUser() } } }',
          loader: 'js',
        }))
      },
    }],
  })
  await mkdir('.playwright-mcp', { recursive: true })
  const file = resolve('.playwright-mcp/estimate-delete-route-tests.cjs')
  await writeFile(file, compiled.outputFiles[0].text)
  return createRequire(import.meta.url)(file) as {
    route: { DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }
  }
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++ }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`); failed++ }
}

async function main() {
  const { route } = await buildRoute()
  const DEL = (id: string) =>
    route.DELETE(new Request(`https://buildos.test/api/estimates/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) })

  const UID = 'user-11111111'
  const EID = 'est-22222222'

  const baseEst = {
    id: EID, status: 'draft', is_locked: false,
    client_approved_at: null, client_rejected_at: null,
    client_name: null, client_signature: null, client_response_note: null,
    title: 'Kitchen Remodel', version: 2,
  }

  function makeState(overrides: Partial<State> = {}): State {
    return {
      user: { id: UID },
      tables: {
        user_permissions: [
          { user_id: UID, module: 'estimates', can_view: true, can_delete: true },
        ],
        estimates: [baseEst],
        budget_lines: [],
        fixer_requests: [],
      },
      permQueryError: false,
      estimateQueryError: false,
      deleteQueryError: false,
      deleteRowCount: undefined,
      ...overrides,
    }
  }

  function setup(state: State) {
    const g = globalThis as Record<string, unknown>
    const admin = makeAdmin(state)
    g['__delRouteTest'] = { admin, getUser: () => ({ data: { user: state.user } }) }
  }

  console.log('\nDELETE /api/estimates/[id] — integration tests')

  await test('401 — no user', async () => {
    const s = makeState(); s.user = null; setup(s)
    assert.equal((await DEL(EID)).status, 401)
  })

  await test('500 — permission query DB error (fail closed)', async () => {
    const s = makeState({ permQueryError: true }); setup(s)
    assert.equal((await DEL(EID)).status, 500)
  })

  await test('403 — estimates perm row present can_delete=false (budget ignored)', async () => {
    const s = makeState()
    s.tables.user_permissions = [
      { user_id: UID, module: 'estimates', can_view: true, can_delete: false },
      { user_id: UID, module: 'budget', can_view: true, can_delete: true },  // budget allows but irrelevant
    ]
    setup(s)
    assert.equal((await DEL(EID)).status, 403)
  })

  await test('403 — estimates perm row present can_view=false (budget allowed but estimates row governs)', async () => {
    const s = makeState()
    s.tables.user_permissions = [
      { user_id: UID, module: 'estimates', can_view: false, can_delete: false },
      { user_id: UID, module: 'budget', can_view: true, can_delete: true },
    ]
    setup(s)
    assert.equal((await DEL(EID)).status, 403)
  })

  await test('403 — no perm rows at all', async () => {
    const s = makeState(); s.tables.user_permissions = []; setup(s)
    assert.equal((await DEL(EID)).status, 403)
  })

  await test('403 — budget fallback: can_view=true but can_delete=false', async () => {
    const s = makeState()
    s.tables.user_permissions = [
      { user_id: UID, module: 'budget', can_view: true, can_delete: false },
    ]
    setup(s)
    assert.equal((await DEL(EID)).status, 403)
  })

  await test('403 — budget fallback: can_delete=true but can_view=false', async () => {
    const s = makeState()
    s.tables.user_permissions = [
      { user_id: UID, module: 'budget', can_view: false, can_delete: true },
    ]
    setup(s)
    assert.equal((await DEL(EID)).status, 403)
  })

  await test('500 — estimate query DB error (fail closed)', async () => {
    const s = makeState({ estimateQueryError: true }); setup(s)
    assert.equal((await DEL(EID)).status, 500)
  })

  await test('404 — unknown estimate id', async () => {
    const s = makeState(); s.tables.estimates = []; setup(s)
    assert.equal((await DEL(EID)).status, 404)
  })

  await test('422 — estimate is approved', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, status: 'approved' }]
    setup(s)
    const res = await DEL(EID)
    assert.equal(res.status, 422)
    const body = await res.json()
    assert.ok(!body.error.includes('Void it first'), 'Approved message must not mention voiding')
  })

  await test('422 — estimate is sent (no "Void it first" wording)', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, status: 'sent' }]
    setup(s)
    const res = await DEL(EID)
    assert.equal(res.status, 422)
    const body = await res.json()
    assert.ok(!body.error.includes('Void it first'), 'Sent message must not suggest voiding (voided is also prohibited)')
  })

  await test('422 — estimate is locked', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, is_locked: true }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — estimate has is_locked=null (fail closed)', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, is_locked: null }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — estimate rejected', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, status: 'rejected' }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — estimate voided', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, status: 'voided' }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — client_name set (client metadata guard)', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, client_name: 'Alice Smith' }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — client_signature set (client metadata guard)', async () => {
    const s = makeState()
    s.tables.estimates = [{ ...baseEst, client_signature: 'Alice Smith' }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('422 — imported to budget (budget_lines reference)', async () => {
    const s = makeState()
    s.tables.budget_lines = [{ id: 'bl-1', notes: `Imported from estimate ${EID}` }]
    setup(s)
    const res = await DEL(EID)
    assert.equal(res.status, 422)
    const body = await res.json()
    assert.ok(body.error.toLowerCase().includes('budget'), 'Error should mention budget')
  })

  await test('422 — fixer has active queued request', async () => {
    const s = makeState()
    s.tables.fixer_requests = [{ id: 'fr-1', estimate_id: EID, status: 'queued' }]
    setup(s)
    const res = await DEL(EID)
    assert.equal(res.status, 422)
    const body = await res.json()
    assert.ok(body.error.toLowerCase().includes('fixer'), 'Error should mention fixer')
  })

  await test('422 — fixer has active running request', async () => {
    const s = makeState()
    s.tables.fixer_requests = [{ id: 'fr-1', estimate_id: EID, status: 'running' }]
    setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })

  await test('500 — DB delete error', async () => {
    const s = makeState({ deleteQueryError: true }); setup(s)
    assert.equal((await DEL(EID)).status, 500)
  })

  await test('409 — concurrent state change (0 rows deleted)', async () => {
    const s = makeState({ deleteRowCount: 0 }); setup(s)
    assert.equal((await DEL(EID)).status, 409)
  })

  await test('204 — success (pristine draft)', async () => {
    const s = makeState(); setup(s)
    assert.equal((await DEL(EID)).status, 204)
  })

  await test('204 — success via budget module fallback (no estimates row)', async () => {
    const s = makeState()
    s.tables.user_permissions = [
      { user_id: UID, module: 'budget', can_view: true, can_delete: true },
    ]
    setup(s)
    assert.equal((await DEL(EID)).status, 204)
  })

  for (const status of ['completed', 'failed']) {
    await test(`422 - preserve Fixer ${status} history`, async () => {
      const s = makeState(); s.tables.fixer_requests = [{id:'history',estimate_id:EID,status}]; setup(s)
      assert.equal((await DEL(EID)).status, 422)
    })
  }
  for (const table of ['chat_messages', 'estimate_line_proposals']) {
    await test(`422 - preserve ${table} history`, async () => {
      const s = makeState(); s.tables[table] = [{id:'history',estimate_id:EID}]; setup(s)
      assert.equal((await DEL(EID)).status, 422)
    })
  }
  await test('422 - preserve linked allowance', async () => {
    const s = makeState(); s.tables.estimate_lines = [{id:'line-1',estimate_id:EID}]
    s.tables.allowances = [{id:'allowance-1',estimate_line_id:'line-1'}]; setup(s)
    assert.equal((await DEL(EID)).status, 422)
  })
  console.log('')
  if (failed > 0) { console.error(`FAILED ${failed}/${failed + passed}`); process.exit(1) }
  else console.log(`PASSED ${passed}/${passed}`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
