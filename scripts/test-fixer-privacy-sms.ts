import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {build} from 'esbuild'
import {existsSync} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
async function main(){
 const path='src/app/api/hermes/approval-sms/route.ts'
 assert.ok(existsSync(path),'A signature-verified approval route must exist')
 const calls:Record<string,unknown>[]=[]
 ;(globalThis as unknown as {approvalCalls:typeof calls}).approvalCalls=calls
 const out=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'db',setup(b){
 b.onResolve({filter:/lib\/supabase\/admin$/},()=>({path:'db',namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({loader:'js',contents:`export function createAdminClient(){return {rpc:async(name,args)=>{globalThis.approvalCalls.push({name,...args});return {data:true,error:null}}}}`}))
 }}]})
 await mkdir('.playwright-mcp',{recursive:true});const file=resolve('.playwright-mcp/privacy-sms-tests.cjs');await writeFile(file,out.outputFiles[0].text)
 const {POST}=createRequire(import.meta.url)(file)
 process.env.TWILIO_AUTH_TOKEN='test-only-token';process.env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32)
 process.env.FIXER_APPROVAL_SMS_URL='https://gateway.test/twilio'
 const id='20000000-0000-4000-8000-000000000001'
 const params={From:'+15133480483',To:'+18334087055',AccountSid:process.env.TWILIO_ACCOUNT_SID,MessageSid:'SM'+'b'.repeat(32),Body:`APPROVE ${id}`}
 function req(p=params,valid=true){const data=process.env.FIXER_APPROVAL_SMS_URL+Object.keys(p).sort().map(k=>k+p[k as keyof typeof p]).join('');return new Request('https://buildos.test/api/hermes/approval-sms',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':valid?createHmac('sha1',process.env.TWILIO_AUTH_TOKEN!).update(data).digest('base64'):'forged'},body:new URLSearchParams(p)})}
 assert.equal((await POST(req(params,false))).status,403);assert.equal(calls.length,0)
 assert.equal((await POST(req({...params,From:'+15135550123'}))).status,403);assert.equal(calls.length,0)
 assert.equal((await POST(req({...params,Body:'YES'}))).status,400);assert.equal(calls.length,0)
 assert.equal((await POST(req())).status,200);assert.equal(calls.length,1)
 assert.deepEqual(calls[0],{name:'decide_fixer_privacy_request',p_id:id,p_from:params.From,p_approve:true,p_sid:params.MessageSid})
 delete process.env.FIXER_APPROVAL_SMS_URL;assert.equal((await POST(req())).status,503);assert.equal(calls.length,1)
 console.log('PASS approval SMS: signature verification, pinned August/Fixer identities, explicit scoped decision, missing-config fail closed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
