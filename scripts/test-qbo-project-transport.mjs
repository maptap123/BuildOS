import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
await build({entryPoints:['src/lib/integrations/quickbooks/projectCreation.ts'],outfile:'.qbo-logs/transport.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'deps',setup(b){b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`export const createAdminClient=()=>({});export const loadQBTokens=async()=>({realm_id:'realm',access_token:'fixture'});export const refreshTokenIfNeeded=async(a,t)=>t;`}))}}]})
const api=(await import(pathToFileURL(process.cwd()+'/.qbo-logs/transport.cjs'))).default
process.env.ENABLE_QB_PROJECT_CREATION='true';process.env.QB_PROJECT_SCOPE_ENABLED='true'
const calls=[]
globalThis.fetch=async(url,options)=>{calls.push({url,...options});return Response.json(calls.length===1?{data:{projectManagementCreateProject:{id:'g1',name:'Addition',customer:{id:'10'}}}}:{data:{projectManagementProject:{id:'g1',name:'Addition',customer:{id:'10'}}}})}
assert.equal(typeof api.createConfirmedProject,'function','real Projects mutation transport exists')
await assert.rejects(()=>api.createConfirmedProject({customerId:'10',name:'Addition',confirmed:false}))
assert.equal(calls.length,0)
const result=await api.createConfirmedProject({customerId:'10',name:'Addition',confirmed:true})
assert.equal(result.id,'g1');assert.equal(calls.length,2)
assert.equal(calls[0].url,'https://qb.api.intuit.com/graphql')
assert.match(JSON.parse(calls[0].body).query,/projectManagementCreateProject/)
assert.match(JSON.parse(calls[1].body).query,/projectManagementProject\(/)
assert.deepEqual(JSON.parse(calls[0].body).variables,{name:'Addition',customer:{id:'10'}})
globalThis.fetch=async()=>Response.json({errors:[{message:'denied'}]})
await assert.rejects(()=>api.createConfirmedProject({customerId:'10',name:'Addition',confirmed:true}),/Projects API|scope/)
process.env.ENABLE_QB_PROJECT_CREATION='false'
await assert.rejects(()=>api.createConfirmedProject({customerId:'10',name:'Addition',confirmed:true}))
console.log('PASS real GraphQL transport: confirmation, fixed mutation, readback, scope failure, disabled flag')
await build({entryPoints:['src/lib/quickbooks/client.ts'],outfile:'.qbo-logs/accounting-client.cjs',bundle:true,platform:'node',format:'cjs'})
const accounting=(await import(pathToFileURL(process.cwd()+'/.qbo-logs/accounting-client.cjs'))).default
for (const method of ['POST','PUT','PATCH','DELETE']) await assert.rejects(()=>accounting.getQBClient({realm_id:'fixture',access_token:'fixture'}).qbFetch('/customer',{method}),/read-only/)
process.env.QB_PROJECT_SCOPE_ENABLED='true'
assert(new URL(accounting.getAuthUrl('state')).searchParams.get('scope').split(' ').includes('project-management.project'),'opt-in reconnect requests Projects scope')
process.env.QB_PROJECT_SCOPE_ENABLED='false'
assert.equal(new URL(accounting.getAuthUrl('state')).searchParams.get('scope'),'com.intuit.quickbooks.accounting')
console.log('PASS accounting client still rejects every write method; opt-in OAuth project scope')
