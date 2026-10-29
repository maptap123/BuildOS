import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
async function main(){
 const calls:Array<{name:string,args:Record<string,unknown>}>=[]
 const state={calls,held:false}
 ;(globalThis as unknown as {employeeRouteState:typeof state}).employeeRouteState=state
 async function route(path:string){
 assert.ok(existsSync(path),'Secure employee worker route must exist: '+path)
 const out=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'db',setup(b){
 b.onResolve({filter:/lib\/supabase\/(admin|server)$/},()=>({path:'db',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export function createAdminClient(){return {rpc:async(name,args)=>{const s=globalThis.employeeRouteState;s.calls.push({name,args});return {data:name==='claim_fixer_employee_request'?{id:'20000000-0000-4000-8000-000000000001',lease_token:'30000000-0000-4000-8000-000000000001',message:'What is scheduled?',scope:{category:'operational'}}:name==='read_fixer_employee_tool'?(s.held?{error:'held'}:{data:[{id:'job'}]}):true,error:null}}}};export function createClient(){throw Error('No employee cookie impersonation in worker')}` }))
 }}]})
 await mkdir('.playwright-mcp',{recursive:true});const f=resolve('.playwright-mcp/'+path.split('/').slice(-2,-1)[0]+'.cjs');await writeFile(f,out.outputFiles[0].text);return createRequire(import.meta.url)(f)
 }
 const {POST:worker}=await route('src/app/api/hermes/privacy-worker/route.ts')
 const req=(body:unknown,key='x'.repeat(32))=>new Request('https://buildos.test',{method:'POST',headers:{authorization:'Bearer '+key},body:JSON.stringify(body)})
 process.env.FIXER_PRIVACY_WORKER_KEY='x'.repeat(32)
 assert.equal((await worker(req({action:'claim'},'wrong'))).status,401)
 const job=(await (await worker(req({action:'claim'}))).json()).job
 assert.ok(job.tools.some((t:{name:string})=>t.name==='list_schedule'))
 assert.ok(!job.tools.some((t:{name:string})=>/email|shell|browser|write|execute/.test(t.name)))
 const {POST:tool}=await route('src/app/api/hermes/privacy-tools/route.ts')
 const token='privacy.'+job.id+'.'+job.lease_token
 const response=await tool(req({tool:'list_jobs',params:{},user_id:'owner'},token))
 assert.equal(response.status,200);assert.equal(calls.at(-1)!.args.p_id,job.id);assert.equal(calls.at(-1)!.args.p_lease,job.lease_token)
 assert.equal((await tool(req({tool:'list_jobs',params:{}},'x'.repeat(32)))).status,401,'Worker long-lived key cannot research without request lease')
 state.held=true;assert.equal((await tool(req({tool:'read_job_finance',params:{}},token))).status,409)
 process.env.FIXER_WORKER_KEY=process.env.FIXER_PRIVACY_WORKER_KEY;assert.equal((await worker(req({action:'claim'}))).status,401,'General worker cannot reuse an estimate worker credential');delete process.env.FIXER_WORKER_KEY;
 console.log('PASS employee worker routes: distinct auth, scoped tools, no impersonation, held fencing')
}
main().catch(e=>{console.error(e);process.exitCode=1})
