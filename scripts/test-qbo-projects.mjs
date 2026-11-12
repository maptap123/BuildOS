import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
await mkdir('.qbo-logs', { recursive: true })
let state
const mock = `
export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.qboState.user } }) } });
export const createAdminClient = () => ({ from(table) { const q = { select(){return q},limit(){return q},eq(k,v){q[k]=v;return q},single:async()=> ({data:table==='user_permissions'?globalThis.qboState.perm:table==='users'?{is_active:globalThis.qboState.active??true}:globalThis.qboState.link}),upsert(){return q},update(payload){if(table==='jobs')(globalThis.qboState.updates??=[]).push(payload);return q},then(resolve){resolve({error:null,data:table==='jobs'?[globalThis.qboState.link]:null})} }; return q }, rpc: async (name,args) => {globalThis.qboState.calls.push({name,args}); return globalThis.qboState.rpcResult ?? {data:1,error:null}} });
export const getQuickBooksCustomer = async id => {if(globalThis.qboState.readError)throw Error('fixture read failure');return globalThis.qboState.customers.find(c=>c.Id===id) ?? null};
export const qbQuery = async query => { (globalThis.qboState.queries??=[]).push(query); return globalThis.qboState.customers };
export const searchQuickBooksCustomers = async () => {globalThis.qboState.searches=(globalThis.qboState.searches??0)+1; return globalThis.qboState.customers};
export const searchSharePointDriveItems = async () => [];
export const createConfirmedProject = async (...args) => { globalThis.qboState.creations.push(args); if(globalThis.qboState.createError)throw new Error('scope denied'); globalThis.qboState.customers.push({Id:'40',DisplayName:'Addition',Active:true,IsProject:true,ParentRef:{value:'10'}}); return {id:'graphql-project',name:'Addition',customer:{id:'10'}} };
export const projectCreationCapability = () => globalThis.qboState.capability ?? ({enabled:true,reason:null});
`
async function bundle(entry, label) {
 const out = `.qbo-logs/${label}.cjs`
 await build({entryPoints:[entry],outfile:out,bundle:true,platform:'node',format:'cjs',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^@\/lib\/(supabase\/|integrations\/quickbooks\/readOnlyClient|integrations\/quickbooks\/projectCreation|integrations\/microsoft\/sharepointReadOnlyClient)/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}))}}]})
 return (await import(pathToFileURL(process.cwd()+'/'+out).href)).default
}
function reset() {state={user:{id:'office'},perm:{can_view:true,can_manage:true,can_edit:true,can_create:true},link:{id:'link',job_id:'job',provider:'quickbooks'},customers:[{Id:'10',DisplayName:'Homeowner',Active:true},{Id:'20',DisplayName:'Kitchen',Active:true,IsProject:true,ParentRef:{value:'10'}},{Id:'30',DisplayName:'Legacy child',Job:true,Active:true,ParentRef:{value:'10'}}],calls:[],creations:[]};globalThis.qboState=state}
const ctx={params:Promise.resolve({id:'job'})}
const req=body=>new Request('http://localhost/api/jobs/job/connected-systems/quickbooks',{method:'POST',body:JSON.stringify(body)})
let passed=0
async function test(name,fn){reset();await fn();passed++;console.log('PASS',name)}
const links=await bundle('src/app/api/jobs/[id]/connected-systems/links/route.ts','links-handler')
await test('legacy QB link approval cannot bypass validated project picker',async()=>{const r=await links.POST(req({link_id:'link',action:'approve'}),ctx);assert.equal(r.status,409)})
if(process.argv.includes('--links-only'))process.exit(0)
const route=await bundle('src/app/api/jobs/[id]/connected-systems/quickbooks/route.ts','project-handler')
await test('requires authenticated office user',async()=>{state.user=null;assert.equal((await route.POST(req({}),ctx)).status,401)})
await test('requires manage rather than mere admin view',async()=>{state.perm={can_view:true};assert.equal((await route.POST(req({}),ctx)).status,403)})
await test('rejects generic Job:true customer as project',async()=>{assert.equal((await route.POST(req({action:'select',customer_id:'10',project_id:'30',version:0}),ctx)).status,400);assert.equal(state.calls.length,0)})
await test('lists only real projects belonging to selected homeowner',async()=>{state.link={id:'job',qb_link_version:0};const r=await route.GET(new Request('http://localhost?customer_id=10'),ctx);assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.projects.map(p=>p.Id),['20'])})
await test('disabled project capability never attempts creation',async()=>{state.capability={enabled:false,reason:'Project scope required'};const r=await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:true,version:0}),ctx);assert.equal(r.status,503);assert.equal(state.creations.length,0)})
await test('confirmed creation claims once and saves verified real project cost target',async()=>{const r=await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:true,version:0}),ctx);assert.equal(r.status,200);assert.equal(state.creations.length,1);assert.equal(state.calls[0].name,'claim_job_quickbooks_creation');const save=state.calls.at(-1);assert.equal(save.name,'set_job_quickbooks_project');assert.equal(save.args.p_project_id,'40');assert.equal(save.args.p_parent_id,'10');assert.equal(save.args.p_graphql_id,'graphql-project')})
await test('unknown identifiers cannot be linked',async()=>{assert.equal((await route.POST(req({action:'select',customer_id:'10',project_id:'9999',version:0}),ctx)).status,400)})
await test('wrong homeowner cannot claim project',async()=>{state.customers.push({Id:'11',DisplayName:'Other homeowner',Active:true});assert.equal((await route.POST(req({action:'select',customer_id:'11',project_id:'20',version:0}),ctx)).status,400)})
await test('existing selection requires no QBO creation confirmation',async()=>{assert.equal((await route.POST(req({action:'select',customer_id:'10',project_id:'20',version:0}),ctx)).status,200);assert.equal(state.creations.length,0)})
await test('creation requires literal true confirmation',async()=>{assert.equal((await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:'true',version:0}),ctx)).status,400);assert.equal(state.creations.length,0)})
await test('claim conflict prevents duplicate mutation',async()=>{state.rpcResult={data:false,error:null};assert.equal((await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:true,version:0}),ctx)).status,409);assert.equal(state.creations.length,0)})
await test('existing project is reused rather than created again',async()=>{const r=await route.POST(req({action:'create',customer_id:'10',name:'Kitchen',confirmed:true,version:0}),ctx);assert.equal(r.status,200);assert.equal(state.creations.length,0)})
await test('scope failure never falls back to a sub-customer',async()=>{state.createError=true;assert.equal((await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:true,version:0}),ctx)).status,502);assert.equal(state.calls.filter(c=>c.name==='set_job_quickbooks_project').length,0)})
await test('failed save does not claim success',async()=>{state.rpcResult={data:null,error:{message:'stale'}};assert.equal((await route.POST(req({action:'select',customer_id:'10',project_id:'20',version:0}),ctx)).status,409)})
const auto=await bundle('src/app/api/jobs/[id]/connected-systems/auto-match/route.ts','auto-handler')
await test('auto-match does not re-search or replace explicitly selected project',async()=>{state.link={id:'job',name:'Kitchen',client_name:'Homeowner',qb_link_version:1};await auto.POST(req({}),ctx);assert.equal(state.searches??0,0)})
const reconcile=await bundle('src/app/api/integrations/job-links/reconcile/route.ts','reconcile-handler')
await test('batch reconciliation preserves explicit project choice',async()=>{state.link={id:'job',name:'Kitchen',client_name:'Homeowner',qb_link_version:1};await reconcile.POST(req({dryRun:false}));assert.equal(state.searches??0,0)})
await test('auto-match never labels generic Job:true as actual project',async()=>{state.link={id:'job',name:'Kitchen',client_name:'Kitchen',qb_link_version:0};state.customers=[{Id:'30',DisplayName:'Kitchen',Active:true,Job:true,IsProject:false,ParentRef:{value:'10'}}];await auto.POST(req({}),ctx);assert.equal(state.updates.find(u=>u.qb_customer_id)?.qb_project_id,null)})
await test('external read failure returns JSON without saving',async()=>{state.readError=true;const r=await route.POST(req({action:'select',customer_id:'10',project_id:'20',version:0}),ctx);assert.equal(r.status,502);assert.equal(state.calls.length,0)})
await test('inactive administrator cannot read project choices',async()=>{state.active=false;assert.equal((await route.GET(new Request('http://localhost?customer_id=10'),ctx)).status,403)})
await test('project names stay out of accounting query syntax',async()=>{await route.POST(req({action:'create',customer_id:'10',name:'Addition',confirmed:true,version:0}),ctx);assert(state.queries.every(q=>!q.includes('WHERE DisplayName')))})
console.log(`${passed} project route tests passed`)
