import assert from 'node:assert/strict'
import { build } from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
async function main(){
 const entry='src/app/api/hermes/privacy-delivery/route.ts';assert.ok(existsSync(entry),'Durable answer SMS endpoint must exist')
 const state={calls:[] as string[],sent:[] as Array<{phone:string,body:string}>,claim:{action:'send',request_id:'request',lease:'lease',phone:'+15135550123',body:'Saved answer'},auth:true}
 ;(globalThis as unknown as {deliveryState:typeof state}).deliveryState=state
 const out=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'deps',setup(b){
 b.onResolve({filter:/lib\/supabase\/(admin|server)$/},()=>({path:'db',namespace:'fixture'}))
 b.onResolve({filter:/lib\/hermes\/employeeSms$/},()=>({path:'sms',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='sms'?`export function employeeSmsConfigured(){return true};export async function sendEmployeeSms(phone,body){globalThis.deliveryState.sent.push({phone,body});return {state:'accepted',sid:'SM'+'a'.repeat(32)}};export async function lookupEmployeeSms(){return {state:'delivered',sid:'SM'+'a'.repeat(32)}}`:`export function createClient(){throw Error('No browser identity')};export function createAdminClient(){return {rpc:async(name,args)=>{const s=globalThis.deliveryState;s.calls.push(name);return {error:null,data:name==='claim_fixer_employee_delivery'?s.claim:name==='authorize_fixer_employee_delivery'?(s.auth?s.claim:null):true}}}}`}))
 }}]})
 await mkdir('.playwright-mcp',{recursive:true});const f=resolve('.playwright-mcp/employee-delivery.cjs');await writeFile(f,out.outputFiles[0].text);const {POST}=createRequire(import.meta.url)(f)
 process.env.FIXER_PRIVACY_DISPATCH_KEY='d'.repeat(32)
 const req=(key='d'.repeat(32))=>new Request('https://buildos.test',{method:'POST',headers:{authorization:'Bearer '+key},body:JSON.stringify({phone:'+15135550999',body:'EVIL'})})
 assert.equal((await POST(req('wrong'))).status,401)
 assert.equal((await POST(req())).status,200)
 assert.deepEqual(state.sent,[{phone:'+15135550123',body:'Saved answer'}],'Recipient/body only from a reauthorized durable DB claim')
 state.auth=false;await POST(req());assert.equal(state.sent.length,1,'Revocation between claim and send cancels delivery')
 state.claim.action='reconcile';await POST(req());assert.equal(state.sent.length,1,'Accepted sends reconcile status, never resend')

 const helper='src/lib/hermes/employeeSms.ts';assert.ok(existsSync(helper),'Provider outcome helper must exist')
 const built=await build({entryPoints:[helper],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
 const hf=resolve('.playwright-mcp/employee-sms-provider.cjs');await writeFile(hf,built.outputFiles[0].text)
 const provider=createRequire(import.meta.url)(hf)
 process.env.TWILIO_ACCOUNT_SID='ACtest';process.env.TWILIO_AUTH_TOKEN='secret';process.env.TWILIO_PHONE_NUMBER='+18334087055'
 const original=globalThis.fetch
 globalThis.fetch=async()=>new Response(JSON.stringify({sid:'SM'+'a'.repeat(32),status:'queued'}),{status:201})
 assert.equal((await provider.sendEmployeeSms('+15135550123','Answer')).state,'accepted')
 globalThis.fetch=async()=>{throw Error('network')}
 assert.equal((await provider.sendEmployeeSms('+15135550123','Answer')).state,'unknown')
 globalThis.fetch=async()=>new Response('{}',{status:400})
 assert.equal((await provider.sendEmployeeSms('+15135550123','Answer')).state,'failed')
 globalThis.fetch=original
 console.log('PASS employee answer SMS: trusted destination, authorization re-read, accepted is not delivered, no resend')
}
main().catch(e=>{console.error(e);process.exitCode=1})
