import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
await build({entryPoints:['src/app/api/leads/[id]/convert/route.ts'],outfile:'.qbo-logs/conversion.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'mock',setup(b){b.onResolve({filter:/^@\/lib\/(supabase\/|proposals\/)/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const createClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'office'}}})}});export const convertAcceptedProposalToJob=async()=>{throw Error('not this fixture')};export const createAdminClient=()=>({from(t){let inserted=false;const q={select(){return q},eq(){return q},insert(v){globalThis.inserts.push(t);inserted=true;return q},update(){return q},single:async()=>({data:t==='user_permissions'?{can_create:true}:t==='leads'?{id:'lead',title:'Addition',client_name:'Homeowner'}:{id:'job'}}),then(f){f({data:inserted?{id:'job'}:null,count:1,error:null})}};return q},rpc:async(n,args)=>{globalThis.rpcs.push({n,args});return {data:{id:'job'},error:null}}});`}))}}]})
const {POST}=(await import(pathToFileURL(process.cwd()+'/.qbo-logs/conversion.cjs'))).default
globalThis.inserts=[];globalThis.rpcs=[]
const response=await POST(new Request('http://localhost',{method:'POST',body:'{}'}),{params:Promise.resolve({id:'lead'})})
assert.equal(response.status,201)
assert.equal(globalThis.rpcs[0]?.n,'ensure_lead_conversion_job','conversion must seed job and backfill lead in a single transaction')
assert(!globalThis.inserts.includes('jobs'),'no separate unsafe job insert')
assert.equal((await response.json()).job.id,'job')
console.log('PASS real conversion route uses atomic seed/reuse RPC and returns saved job')
await build({entryPoints:['src/lib/proposals/conversion.ts'],outfile:'.qbo-logs/accepted-conversion.cjs',bundle:true,platform:'node',format:'cjs'})
const {convertAcceptedProposalToJob}=(await import(pathToFileURL(process.cwd()+'/.qbo-logs/accepted-conversion.cjs'))).default
const acceptedCalls=[]
const admin={from(t){const q={select(){return q},eq(){return q},in(){return q},ilike(){return q},order(){return q},limit(){return q},update(){return q},insert(){return q},single:async()=>({data:t==='leads'?{id:'lead',title:'Addition',client_name:'Homeowner'}:{id:'job'}}),then(f){f({data:t==='estimates'?[{id:'estimate',created_by:'office'}]:t==='estimate_lines'?[{id:'line',description:'Work',quantity:1,unit_cost:20,markup_pct:10}]:null,count:1,error:null})}};return q},rpc:async(n,args)=>{acceptedCalls.push({n,args});return {data:{id:'job'},error:null}}}
await convertAcceptedProposalToJob({admin,leadId:'lead',estimateId:'estimate',actorUserId:'office'})
assert.equal(acceptedCalls[0]?.n,'ensure_lead_conversion_job','accepted proposals use the same atomic job seed')
console.log('PASS accepted-proposal conversion uses atomic seed/reuse RPC')
