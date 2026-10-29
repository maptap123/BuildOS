import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { build } from 'esbuild'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function main() {
 const db = new PGlite()
 const user = '10000000-0000-4000-8000-000000000001', owner = '10000000-0000-4000-8000-000000000002', job = '20000000-0000-4000-8000-000000000001'
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table users(id uuid primary key,is_active boolean,phone text,full_name text);
 create table user_permissions(user_id uuid,module text,can_view boolean,can_manage boolean default false);
 insert into users values('${user}',true,'+15135550123','Synthetic employee'),('${owner}',true,'+15133480483','Synthetic owner');
 insert into user_permissions values('${user}','ai',true,false),('${user}','jobs',true,false),('${user}','budget',true,false),('${owner}','admin',true,true);
 create table jobs(id uuid primary key,name text,job_number text,status text,site_address text,start_date date,target_completion_date date,contract_amount numeric);
 insert into jobs values('${job}','Synthetic fixture job','TEST','active','Synthetic site',null,null,99999);
 create table budget_lines(id uuid,job_id uuid,revised_budget numeric,committed_cost numeric,forecast_cost numeric);
 insert into budget_lines values('${job}','${job}',100,10,110);`)
 for (const migration of ['20261028120000_fixer_privacy_review.sql','20261028130000_fixer_private_worker.sql']) await db.exec(await readFile('supabase/migrations/'+migration,'utf8'))
 await db.exec(`insert into fixer_privacy_settings values(true,'${owner}')`)
 const rpcArgs:Record<string,string[]> = {
 enqueue_fixer_employee_request:['p_id','p_user','p_message','p_conversation'],list_fixer_employee_requests:['p_user'],claim_fixer_employee_request:[],
 read_fixer_employee_tool:['p_id','p_lease','p_tool','p_params'],update_fixer_employee_request:['p_id','p_lease','p_action','p_text'],
 decide_fixer_privacy_request:['p_id','p_from','p_approve','p_sid'],claim_fixer_employee_delivery:[],authorize_fixer_employee_delivery:['p_id','p_lease'],
 finish_fixer_employee_delivery:['p_id','p_lease','p_state','p_sid'],
 }
 const sent:Array<{phone:string,body:string}>=[]
 const state={user,db,sent,async rpc(name:string,args:Record<string,unknown>={}) {
  const keys=rpcArgs[name];assert.ok(keys,'Unexpected RPC '+name)
  try {const r=await db.query<{value:unknown}>(`select ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) value`,keys.map(k=>typeof args[k]==='object' && args[k]!==null?JSON.stringify(args[k]):args[k]));return {data:r.rows[0].value,error:null}}
  catch(error){return {data:null,error}}
 }}
 ;(globalThis as unknown as {employeeE2E:typeof state}).employeeE2E=state
 const fixture=`export async function createClient(){return {auth:{getUser:async()=>({data:{user:{id:globalThis.employeeE2E.user}}})}}};export function createAdminClient(){return {rpc:(...args)=>globalThis.employeeE2E.rpc(...args),from(table){let columns='',filters=[];const q={select(c){columns=c;return q},eq(k,v){filters.push([k,v]);return q},async single(){const r=await globalThis.employeeE2E.db.query('select '+columns+' from '+table+' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '),filters.map(([,v])=>v));return {data:r.rows[0],error:null}}};return q}}}`
 const routes:Record<string,{POST?:(request:Request)=>Promise<Response>,GET?:()=>Promise<Response>}>= {}
 await mkdir('.playwright-mcp',{recursive:true})
 for(const name of ['chat','privacy-worker','privacy-tools','privacy-requests','approval-sms','privacy-delivery']){
 const out=await build({entryPoints:['src/app/api/hermes/'+name+'/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-db-provider',setup(b){
 b.onResolve({filter:/lib\/supabase\/(admin|server)$/},()=>({path:'db',namespace:'fixture'}))
 b.onResolve({filter:/lib\/hermes\/employeeSms$/},()=>({path:'sms',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='db'?fixture:`export function employeeSmsConfigured(){return true};export async function sendEmployeeSms(phone,body){globalThis.employeeE2E.sent.push({phone,body});return {state:'accepted',sid:'SM'+'a'.repeat(32)}};export async function lookupEmployeeSms(){return {state:'delivered',sid:'SM'+'a'.repeat(32)}}`}))
 }}]})
 const f=resolve('.playwright-mcp/employee-e2e-'+name+'.cjs');await writeFile(f,out.outputFiles[0].text);routes[name]=createRequire(import.meta.url)(f)
 }
 process.env.FIXER_PRIVACY_REVIEW_ENABLED='true';process.env.FIXER_PRIVACY_WORKER_KEY='w'.repeat(32);process.env.FIXER_PRIVACY_DISPATCH_KEY='d'.repeat(32)
 const post=(name:string,body:unknown,key?:string)=>routes[name].POST!(new Request('https://buildos.test/api/hermes/'+name,{method:'POST',headers:{'content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},body:JSON.stringify(body)}))
 async function submit(message:string){const response=await post('chat',{message,user_id:owner,phone:'+15135550999'});assert.equal(response.status,200);const events=(await response.text()).split('\n\n').filter(Boolean).map(x=>JSON.parse(x.slice(6)));return events.find(e=>e.type==='queued')}
 const queued=await submit('Which jobs are active?');assert.equal(queued.status,'queued')
 const normal=(await (await post('privacy-worker',{action:'claim'},'w'.repeat(32))).json()).job
 assert.equal(normal.id,queued.requestId)
 const token='privacy.'+normal.id+'.'+normal.lease_token
 const read=await post('privacy-tools',{tool:'list_jobs',params:{}},token)
 assert.equal(read.status,200);assert.doesNotMatch(await read.text(),/99999|contract_amount/)
 assert.equal((await post('privacy-worker',{action:'complete',id:normal.id,lease:normal.lease_token,text:'Synthetic fixture job is active.'},'w'.repeat(32))).status,200)
 // No browser is involved between submission and worker completion.
 const rows=await (await routes['privacy-requests'].GET!()).json();assert.equal(rows.find((r:{id:string})=>r.id===normal.id).result,'Synthetic fixture job is active.')
 assert.equal((await post('privacy-delivery',{},'d'.repeat(32))).status,200)
 assert.deepEqual(sent,[{phone:'+15135550123',body:'Synthetic fixture job is active.'}])
 await post('privacy-delivery',{},'d'.repeat(32));assert.equal(sent.length,1,'Known SID reconciles, never resends')
 const sensitive=await submit('What is the Synthetic fixture job budget?');assert.equal(sensitive.status,'held')
 assert.equal((await (await post('privacy-worker',{action:'claim'},'w'.repeat(32))).json()).job,null)
 process.env.TWILIO_AUTH_TOKEN='synthetic-test-token';process.env.TWILIO_ACCOUNT_SID='ACfixture';process.env.FIXER_APPROVAL_SMS_URL='https://sms.test/original'
 const form=new URLSearchParams({AccountSid:'ACfixture',From:'+15133480483',To:'+18334087055',Body:'APPROVE '+sensitive.requestId,MessageSid:'SM'+'b'.repeat(32)})
 const signature=createHmac('sha1',process.env.TWILIO_AUTH_TOKEN).update(process.env.FIXER_APPROVAL_SMS_URL+[...form.keys()].sort().map(k=>k+form.get(k)).join('')).digest('base64')
 assert.equal((await routes['approval-sms'].POST!(new Request('https://buildos.test/api/hermes/approval-sms',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},body:form.toString()}))).status,200,'Synthetic signed SMS, not real owner consent')
 const approved=(await (await post('privacy-worker',{action:'claim'},'w'.repeat(32))).json()).job
 assert.equal(approved.id,sensitive.requestId)
 const financial=await post('privacy-tools',{tool:'read_job_finance',params:{job_id:job}},'privacy.'+approved.id+'.'+approved.lease_token)
 assert.equal(financial.status,200);assert.equal((await financial.json()).data[0].revised_budget,100)
 await post('privacy-worker',{action:'complete',id:approved.id,lease:approved.lease_token,text:'Synthetic approved financial answer'},'w'.repeat(32))
 await post('privacy-delivery',{},'d'.repeat(32));assert.equal(sent.length,2);assert.doesNotMatch(sent[1].body,/financial answer/)
 await db.exec(`update user_permissions set can_view=false where user_id='${user}' and module='budget'`)
 const revoked=await (await routes['privacy-requests'].GET!()).json();assert.equal(revoked.find((r:{id:string})=>r.id===approved.id).result,undefined)
 state.user=owner
 assert.deepEqual(await (await routes['privacy-requests'].GET!()).json(),{error:'Active user and AI access required'})
 await db.close();console.log('PASS actual employee routes + real isolated SQL: queue to fenced tools to persisted app answer to SMS outbox, signed sensitive approval and revocation')
}
main().catch(e=>{console.error(e);process.exitCode=1})
