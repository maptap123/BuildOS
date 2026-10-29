import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

async function main() {
 const state = { user: { id: '10000000-0000-4000-8000-000000000001' } as {id:string}|null, active: true, ai: true, calls: 0, rpcError: null as null|{message:string}, rpcCalls: [] as Record<string,unknown>[] }
 ;(globalThis as unknown as {privacyState: typeof state}).privacyState = state
 const output = await build({entryPoints:['src/app/api/hermes/chat/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-dependencies',setup(b){
 b.onResolve({filter:/lib\/supabase\/(admin|server)$/},a=>({path:a.path.endsWith('/server')?'server':'admin',namespace:'fixture'}))
 b.onResolve({filter:/lib\/hermes\/agent$/},()=>({path:'agent',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='server'?`export async function createClient(){return {auth:{getUser:async()=>({data:{user:globalThis.privacyState.user}})}}}`:a.path==='agent'?`export async function* hermesStream(){globalThis.privacyState.calls++;yield {type:'delta',text:'SECRET'};yield {type:'done',conversationId:'test'}}`:`export function createAdminClient(){return {rpc:async(name,args)=>{globalThis.privacyState.rpcCalls.push({name,...args});return {data:{id:args.p_id,status:'queued',sms_enabled:false},error:globalThis.privacyState.rpcError}},from(table){let q={select(){return q},eq(){return q},single:async()=>({data:table==='users'?{is_active:globalThis.privacyState.active}:{can_view:globalThis.privacyState.ai},error:null})};return q}}}`}))
 }}]})
 await mkdir('.playwright-mcp',{recursive:true})
 const file=resolve('.playwright-mcp/privacy-chat-tests.cjs');await writeFile(file,output.outputFiles[0].text)
 const {POST}=createRequire(import.meta.url)(file)
 const req=()=>new Request('https://buildos.test/api/hermes/chat',{method:'POST',headers:{'Idempotency-Key':'20000000-0000-4000-8000-000000000001'},body:JSON.stringify({message:'What is scheduled?',user_id:'owner',phone:'+15133480483'})})
 const denied=await POST(req());await denied.text()
 assert.equal(state.calls,0,'Unscoped gateway must never execute for an employee, even for an innocent-looking question')
 assert.equal(denied.status,503,'Fail closed until durable review is configured')
 process.env.FIXER_PRIVACY_REVIEW_ENABLED='true'
 const queued=await POST(req());const queuedText=await queued.text()
 assert.equal(queued.status,200,'Configured review durably queues instead of using the gateway')
 assert.equal(state.rpcCalls.length,1)
 assert.equal(state.rpcCalls[0].p_id,'20000000-0000-4000-8000-000000000001','A stable client retry key must deduplicate enqueue');
 assert.equal(state.rpcCalls[0].p_user,state.user!.id,'Requester must come from session, not request body')
 assert.equal(state.rpcCalls[0].name,'enqueue_fixer_employee_request')
 assert.match(queuedText,/saved/i);assert.match(queuedText,/You can close the app/i);assert.match(queuedText,/\"type\":\"queued\"/);assert.match(queuedText,/\"smsEnabled\":false/);assert.match(queuedText,/requestId/);assert.doesNotMatch(queuedText,/SECRET/)
 assert.equal(state.calls,0)
 state.rpcError={message:'Name exactly one employee by full name for compensation access.'};const missing=await POST(req());assert.equal(missing.status,422);assert.match(await missing.text(),/Name exactly one employee/);state.rpcError=null
 delete process.env.FIXER_PRIVACY_REVIEW_ENABLED
 state.user=null;assert.equal((await POST(req())).status,401)
 state.user={id:'10000000-0000-4000-8000-000000000001'};state.active=false
 assert.equal((await POST(req())).status,403,'Inactive users cannot submit or research')
 console.log('PASS privacy chat: server identity, fail-closed gateway isolation, inactive denial')
}
main().catch(e=>{console.error(e);process.exitCode=1})
