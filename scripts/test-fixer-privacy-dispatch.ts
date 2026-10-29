import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {existsSync} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
async function main(){
 const path='src/app/api/hermes/privacy-dispatch/route.ts';assert.ok(existsSync(path),'Durable approval notice dispatcher must exist')
 const state={calls:[] as Record<string,unknown>[],sms:[] as {to:string,body:string}[],ok:true}
 ;(globalThis as unknown as {dispatchState:typeof state}).dispatchState=state
 const out=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'dependencies',setup(b){
 b.onResolve({filter:/lib\/(supabase\/admin|twilio\/client)$/},a=>({path:a.path.endsWith('/admin')?'db':'sms',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='db'?`export function createAdminClient(){return {rpc:async(name,args)=>{globalThis.dispatchState.calls.push({name,...args});return {data:name==='claim_fixer_privacy_notice'?{request_id:'20000000-0000-4000-8000-000000000001',user_id:'employee-id',full_name:'Employee Name',scope:{category:'job_finance',job_ids:['exact-job']},message:'Question',lease:'lease'}:true,error:null}}}}`:`export async function sendSms(to,body){globalThis.dispatchState.sms.push({to,body});return {ok:globalThis.dispatchState.ok,sid:globalThis.dispatchState.ok?'SMsent':undefined}}`}))
 }}]})
 await mkdir('.playwright-mcp',{recursive:true});const file=resolve('.playwright-mcp/privacy-dispatch-tests.cjs');await writeFile(file,out.outputFiles[0].text)
 const {POST}=createRequire(import.meta.url)(file)
 const req=(key='wrong')=>new Request('https://buildos.test/api/hermes/privacy-dispatch',{method:'POST',headers:{Authorization:`Bearer ${key}`}})
 process.env.FIXER_PRIVACY_DISPATCH_KEY='private-test-dispatch-key-'.repeat(2)
 assert.equal((await POST(req())).status,401);assert.equal(state.sms.length,0);assert.equal(state.calls.length,0)
 assert.equal((await POST(req(process.env.FIXER_PRIVACY_DISPATCH_KEY))).status,200)
 assert.equal(state.sms.length,1);assert.equal(state.sms[0].to,'+15133480483')
 assert.match(state.sms[0].body,/APPROVE 20000000/);assert.match(state.sms[0].body,/Question/);assert.match(state.sms[0].body,/Employee Name/);assert.match(state.sms[0].body,/employee-id/);assert.match(state.sms[0].body,/exact-job/);assert.doesNotMatch(state.sms[0].body,/not enabled yet/)
 assert.deepEqual(state.calls.at(-1),{name:'finish_fixer_privacy_notice',p_id:'20000000-0000-4000-8000-000000000001',p_lease:'lease',p_sid:'SMsent'})
 state.ok=false;assert.equal((await POST(req(process.env.FIXER_PRIVACY_DISPATCH_KEY))).status,200)
 assert.equal(state.calls.at(-1)?.p_sid,null,'Ambiguous provider failure must not be reported delivered or retried automatically')
 console.log('PASS notice dispatch: separate service authentication, pinned August destination, durable claim/finalization, ambiguous-send safety')
}
main().catch(e=>{console.error(e);process.exitCode=1})
