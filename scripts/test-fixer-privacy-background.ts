import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
type Row=Record<string,unknown>
class Query {
 constructor(public rows:Row[]){}
 select(){return this}
 eq(k:string,v:unknown){this.rows=this.rows.filter(r=>r[k]===v);return this}
 in(k:string,v:unknown[]){this.rows=this.rows.filter(r=>v.includes(r[k]));return this}
 async single(){return {data:this.rows[0]??null,error:null}}
 async maybeSingle(){return this.single()}
 then<T>(fn:(r:{data:Row[],error:null})=>T){return Promise.resolve(fn({data:this.rows,error:null}))}
}
async function main(){
 const id='10000000-0000-4000-8000-000000000001'
 const tables:Record<string,Row[]>={users:[{id,is_active:true}],user_permissions:[{user_id:id,module:'ai',can_view:true},{user_id:id,module:'budget',can_view:true,can_create:true},{user_id:id,module:'admin',can_manage:true}]}
 const admin={from:(table:string)=>new Query([...(tables[table]??[])])}
 const out=await build({entryPoints:['src/lib/hermes/background.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'auth',setup(b){b.onResolve({filter:/lib\/supabase\/(admin|server)$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function createClient(){};export function createAdminClient(){}'}))}}]})
 await mkdir('.playwright-mcp',{recursive:true});const file=resolve('.playwright-mcp/privacy-background-tests.cjs');await writeFile(file,out.outputFiles[0].text)
 const {canUseBackground}=createRequire(import.meta.url)(file)
 assert.equal(await canUseBackground(admin,id),true,'Existing authenticated AI+budget estimator permission must not be restricted to August')
 tables.fixer_privacy_settings=[{id:true,approver_user_id:id}]
 tables.fixer_verified_phones=[{user_id:id,phone:'+15135559999'}]
 assert.equal(await canUseBackground(admin,id),true,'Estimate access must not require phone onboarding')
 tables.fixer_verified_phones[0].phone='+15133480483'
 assert.equal(await canUseBackground(admin,id),true,'Existing estimate worker remains available only to the configured verified August')
 tables.users[0].is_active=false;assert.equal(await canUseBackground(admin,id),false)
 console.log('PASS estimating access preserved: AI + budget create/view, no owner/phone gate, inactive denied')
}
main().catch(e=>{console.error(e);process.exitCode=1})
