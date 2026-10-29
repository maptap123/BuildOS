import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {existsSync} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
async function main(){
 const path='src/app/api/hermes/privacy-requests/route.ts';assert.ok(existsSync(path),'A safe saved-status route must exist')
 const state={user:{id:'employee'} as {id:string}|null,active:true,ai:true,rows:[{id:'ours',user_id:'employee',status:'held',message:'SECRET QUESTION',phone:'+15135550123',decided_by:'owner',result:'SECRET ANSWER'},{id:'theirs',user_id:'other',status:'held'}]}
 ;(globalThis as unknown as {statusState:typeof state}).statusState=state
 const fixture=`export async function createClient(){return {auth:{getUser:async()=>({data:{user:globalThis.statusState.user}})}}};export function createAdminClient(){return {rpc:async(name,args)=>({data:globalThis.statusState.rows.filter(r=>r.user_id===args.p_user),error:null}),from(table){let rows=table==='users'?[{is_active:globalThis.statusState.active}]:table==='user_permissions'?[{can_view:globalThis.statusState.ai}]:globalThis.statusState.rows;let columns='*';const q={select(c){columns=c;return q},eq(k,v){if(k==='user_id'&&table==='fixer_privacy_requests')rows=rows.filter(r=>r[k]===v);return q},order(){return q},limit(n){rows=rows.slice(0,n);return q},single:async()=>({data:rows[0],error:null}),then(fn){return Promise.resolve(fn({data:rows.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]]))),error:null}))}};return q}}}`
 const out=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'dependencies',setup(b){b.onResolve({filter:/lib\/supabase\/(admin|server)$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:fixture}))}}]})
 await mkdir('.playwright-mcp',{recursive:true});const file=resolve('.playwright-mcp/privacy-status-tests.cjs');await writeFile(file,out.outputFiles[0].text)
 const {GET}=createRequire(import.meta.url)(file)
 const response=await GET(new Request('https://buildos.test/api/hermes/privacy-requests?user_id=other'));const text=await response.text()
 assert.equal(response.status,200);const rows=JSON.parse(text);assert.equal(rows.length,1);assert.equal(rows[0].id,'ours');assert.doesNotMatch(text,/SECRET|phone|decided_by|theirs/)
 assert.equal(response.headers.get('cache-control'),'no-store')
 Object.assign(state.rows[0],{status:'approved_waiting_for_secure_worker',expires_at:'2000-01-01T00:00:00Z'})
 assert.equal((await (await GET()).json())[0].result,undefined,'No result disclosure outside completed status')
 Object.assign(state.rows[0],{status:'completed',result:'AUTHORIZED RESULT'});assert.equal((await (await GET()).json())[0].result,'AUTHORIZED RESULT');
 state.active=false;assert.equal((await GET()).status,403)
 state.user=null;assert.equal((await GET()).status,401)
 console.log('PASS saved privacy status: requester-only, no question/answer/phone/audit leakage, inactive denial, no cache')
}
main().catch(e=>{console.error(e);process.exitCode=1})
