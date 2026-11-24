// Exercise the real handler with isolated auth, database and storage boundaries.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Row = Record<string, unknown>
const UID = 'crew-user'
const ID = '0ebe7ee6-2e8e-4de3-a0d3-fe35533f4d7b'
const signedUrl = 'https://storage.test/private-plan.pdf?token=short-lived'
interface State {
  user: { id: string } | null
  authError: boolean
  permissionError: boolean
  documentError: boolean
  signingError: boolean
  signingThrow: boolean
  signedUrl: string | null
  permissions: Row[]
  documents: Row[]
  queries: string[]
  signed: unknown[][]
}
function fixture(): State {
  return {
    user: { id: UID }, authError: false, permissionError: false,
    documentError: false, signingError: false, signingThrow: false, signedUrl,
    permissions: [
      { user_id: UID, module: 'documents', can_view: true },
      { user_id: UID, module: 'budget', can_view: false },
      { user_id: UID, module: 'admin', can_view: false },
    ],
    documents: [{ id: ID, storage_bucket: 'documents', file_path: 'job/private-plan.pdf' }],
    queries: [], signed: [],
  }
}
function setup(s: State) {
  const admin = {
    from(table: string) {
      s.queries.push(table)
      assert.ok(['documents', 'user_permissions'].includes(table))
      const filters: [string, unknown][] = []
      const query = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push([key, value]); return query },
        async maybeSingle() {
          const error = table === 'documents' ? s.documentError : s.permissionError
          const rows = table === 'documents' ? s.documents : s.permissions
          return { data: error ? null : rows.find(r => filters.every(([k, v]) => r[k] === v)) ?? null,
            error: error ? { message: 'private backend details' } : null }
        },
      }
      return query
    },
    storage: { from(bucket: string) { return {
      async createSignedUrl(path: string, expires: number) {
        s.signed.push([bucket, path, expires])
        if (s.signingThrow) throw new Error('private backend details')
        return { data: s.signedUrl ? { signedUrl: s.signedUrl } : null,
          error: s.signingError ? { message: 'private backend details' } : null }
      },
    } } },
  }
  Object.assign(globalThis, { __documentDownloadTest: { admin,
    getUser: () => ({ data: { user: s.user }, error: s.authError ? { message: 'invalid session' } : null }),
  } })
}
async function main() {
  const compiled = await build({
    stdin: { contents: "export { GET } from './src/app/api/documents/[id]/download/route'", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'isolated-boundaries', setup(b) {
      b.onResolve({ filter: /lib\/supabase\/(admin|server)$/ }, args => ({ path: args.path.endsWith('/admin') ? 'admin' : 'server', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ loader: 'js', contents: args.path === 'admin'
        ? 'export function createAdminClient(){return globalThis.__documentDownloadTest.admin}'
        : 'export async function createClient(){return {auth:{getUser:async()=>globalThis.__documentDownloadTest.getUser()}}}' }))
    } }],
  })
  await mkdir('.playwright-mcp', { recursive: true })
  const file = resolve('.playwright-mcp/document-download-route.cjs')
  await writeFile(file, compiled.outputFiles[0].text)
  const { GET } = createRequire(import.meta.url)(file) as {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
  }
  const get = (id = ID) => GET(new Request(`https://buildos.test/api/documents/${id}/download`), { params: Promise.resolve({ id }) })
  let passed = 0
  async function test(name: string, run: () => Promise<void>) {
    await run(); passed++; console.log(`PASS ${name}`)
  }
  await test('Crew documents-view access opens private PDF without budget/admin access', async () => {
    const s = fixture(); setup(s)
    const response = await get()
    assert.equal(response.status, 307)
    assert.equal(response.headers.get('location'), signedUrl)
    assert.deepEqual(s.signed, [['documents', 'job/private-plan.pdf', 60]])
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  })
  for (const [name, change, status] of [
    ['unauthenticated', (s: State) => { s.user = null }, 401],
    ['invalid session', (s: State) => { s.authError = true }, 401],
    ['documents denied despite admin/budget grants', (s: State) => { s.permissions = [
      { user_id: UID, module: 'documents', can_view: false },
      { user_id: UID, module: 'admin', can_view: true },
      { user_id: UID, module: 'budget', can_view: true },
    ] }, 403],
    ['missing permission', (s: State) => { s.permissions = [] }, 403],
    ['other user permission cannot grant access', (s: State) => { s.permissions[0].user_id = 'other-user' }, 403],
  ] as const) {
    await test(name, async () => {
      const s = fixture(); change(s); setup(s)
      const response = await get()
      assert.equal(response.status, status)
      assert.deepEqual(s.signed, [])
      assert.ok(!s.queries.includes('documents'), 'Do not retrieve document metadata before authorization')
    })
  }
  for (const [name, change, status] of [
    ['permission lookup failure', (s: State) => { s.permissionError = true }, 500],
    ['missing document', (s: State) => { s.documents = [] }, 404],
    ['document lookup failure', (s: State) => { s.documentError = true }, 500],
    ['missing storage path', (s: State) => { s.documents[0].file_path = '' }, 404],
    ['missing storage bucket', (s: State) => { s.documents[0].storage_bucket = null }, 404],
    ['signing failure', (s: State) => { s.signingError = true }, 500],
    ['missing signed URL', (s: State) => { s.signedUrl = null }, 500],
    ['storage exception', (s: State) => { s.signingThrow = true }, 500],
  ] as const) {
    await test(name, async () => {
      const s = fixture(); change(s); setup(s)
      const response = await get()
      assert.equal(response.status, status)
      assert.equal(response.headers.get('location'), null)
      assert.ok(!(await response.text()).includes('private backend details'))
      if (name.startsWith('permission') || name.startsWith('missing storage') || name === 'missing document' || name === 'document lookup failure') {
        assert.deepEqual(s.signed, [])
      }
    })
  }
  await test('unknown document ID does not sign another document', async () => {
    const s = fixture(); setup(s)
    assert.equal((await get('other-document')).status, 404)
    assert.deepEqual(s.signed, [])
  })
  console.log(`PASSED ${passed}/${passed}`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
