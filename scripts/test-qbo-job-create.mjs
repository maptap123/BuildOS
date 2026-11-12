import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
await build({entryPoints:['src/app/api/jobs/route.ts'],outfile:'.qbo-logs/job-create.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'mock',setup(b){b.onResolve({filter:/^@\/lib\/supabase\//},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const createClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'office'}}})}});export const createAdminClient=()=>({from(t){const q={select(){return q},eq(){return q},insert(v){globalThis.inserted=v;return q},single:async()=>({data:t==='user_permissions'?{can_create:true,can_manage:true}:{id:'job'}}),then(f){f({count:0})}};return q}});`}))}}]})
const {POST}=(await import(pathToFileURL(process.cwd()+'/.qbo-logs/job-create.cjs'))).default
await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({name:'Addition',client_name:'Homeowner',status:'active',qb_customer_id:'unverified',qb_project_id:'unverified',qb_link_version:99,qb_parent_customer_id:'unverified',qb_graphql_project_id:'unverified'})}))
for(const field of ['qb_customer_id','qb_project_id','qb_parent_customer_id','qb_graphql_project_id'])assert.equal(globalThis.inserted[field]??null,null,`${field} cannot bypass validated selection`)
assert.equal(globalThis.inserted.qb_link_version??0,0)
console.log('PASS direct job creation rejects caller-supplied QuickBooks mapping fields')
