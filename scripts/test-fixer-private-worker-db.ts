import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
const u='10000000-0000-4000-8000-000000000001',o='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001'
async function main(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table users(id uuid primary key,is_active boolean,phone text,full_name text);
 create table user_permissions(user_id uuid,module text,can_view boolean,can_manage boolean default false);
 insert into users values('${u}',true,null,'Employee'),('${o}',true,'+15133480483','August');
 insert into user_permissions values('${u}','ai',true,false),('${u}','jobs',true,false),('${u}','schedule',true,false),('${o}','admin',true,true);
 create table jobs(id uuid primary key,name text,status text,contract_amount numeric,internal_notes text);
 insert into jobs values('${id}','Test job','active',999,'SECRET');
 create table tasks(id uuid,job_id uuid,title text,status text,due_date date);
 create table schedule_items(id uuid,job_id uuid,title text,start_date date,end_date date,status text);
 create table daily_logs(id uuid,job_id uuid,log_date date,work_performed text);
 create table budget_lines(id uuid,job_id uuid,revised_budget numeric,committed_cost numeric,forecast_cost numeric);
 create table actuals(id uuid,job_id uuid,amount numeric,status text,incurred_date date);`)
 await db.exec(`alter table jobs add column job_number text, add column site_address text, add column start_date date, add column target_completion_date date;alter table tasks add column priority text;alter table schedule_items add column trade text,add column percent_complete numeric;alter table daily_logs add column weather_summary text,add column manpower_count integer;`)
 await db.exec(await readFile('supabase/migrations/20261028120000_fixer_privacy_review.sql','utf8'))
 const next=await readFile('supabase/migrations/20261028130000_fixer_private_worker.sql','utf8').catch(()=> '')
 await db.exec(`insert into fixer_privacy_requests(id,user_id,phone,message,status) values('20000000-0000-4000-8000-000000000000','${u}','+15135550123','Legacy held question','approved_waiting_for_secure_worker')`)
 await db.exec(next)
 assert.equal((await db.query<{status:string}>(`select status from fixer_privacy_requests where id='20000000-0000-4000-8000-000000000000'`)).rows[0].status,'expired')
 const q=await db.query<{r:{status:string,sms_enabled:boolean}}>(`select enqueue_fixer_employee_request($1,$2,$3,$4) r`,[id,u,'What is scheduled?',null])
 assert.equal(q.rows[0].r.status,'queued','Ordinary questions must run without phone onboarding')
 assert.equal(q.rows[0].r.sms_enabled,false)

 const claim=await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')
 assert.equal(claim.rows[0].r.id,id)
 const lease=claim.rows[0].r.lease_token
 assert.equal((await db.query<{r:{error:string}}> ('select read_fixer_employee_tool($1,$2,$3,$4) r',[id,lease,'list_jobs',{job_id:id.replaceAll('-','')}])).rows[0].r.error,'invalid_parameters','Do not repair noncanonical record identifiers')
 const tool=await db.query<{r:{data:unknown,error?:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[id,lease,'list_jobs',{}])
 assert.doesNotMatch(JSON.stringify(tool.rows),/999|SECRET|contract_amount|internal_notes/,'Projection never includes money or private columns')
 const done=await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[id,lease,'complete','Test job is active.'])
 assert.equal(done.rows[0].r,true)
 assert.equal((await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[id,lease,'complete','Test job is active.'])).rows[0].r,true,'Identical result retry is idempotent')
 assert.equal((await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[id,lease,'complete','different'])).rows[0].r,false)
 const history=await db.query<{r:Array<{result:string}>}>('select list_fixer_employee_requests($1) r',[u])
 assert.equal(history.rows[0].r[0].result,'Test job is active.')
 await db.exec(`update user_permissions set can_view=false where user_id='${u}' and module='jobs'`)
 const revoked=await db.query<{r:Array<{result?:string}>}>('select list_fixer_employee_requests($1) r',[u])
 assert.equal(revoked.rows[0].r[0].result,undefined,'Revoked source module suppresses already completed result')

 await db.exec(`update user_permissions set can_view=true where user_id='${u}' and module='jobs';
 insert into fixer_privacy_settings values(true,'${o}');
 insert into user_permissions values('${u}','budget',true,false);
 insert into budget_lines values('${id}','${id}',123,10,130);`)
 const f='20000000-0000-4000-8000-000000000002'
 assert.equal((await db.query<{r:{status:string}}>('select enqueue_fixer_employee_request($1,$2,$3,$4) r',[f,u,'What is the Test job budget?',null])).rows[0].r.status,'held')
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_request() r')).rows[0].r,null,'Held question cannot run')
 const notice=await db.query<{r:{request_id:string,full_name:string,scope:unknown}}>('select claim_fixer_privacy_notice() r')
 assert.equal(notice.rows[0].r.full_name,'Employee','Account name, no separate identification')
 assert.equal(notice.rows[0].r.request_id,f)
 assert.equal((await db.query<{r:boolean}>('select decide_fixer_privacy_request($1,$2,$3,$4) r',[f,'+15133480483',true,'SM'+ 'a'.repeat(32)])).rows[0].r,true)
 const financial=await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')
 assert.equal(financial.rows[0].r.id,f)
 const fl=financial.rows[0].r.lease_token
 const money=await db.query<{r:{data:Array<{revised_budget:number}>}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[f,fl,'read_job_finance',{job_id:id}])
 assert.equal(money.rows[0].r.data[0].revised_budget,123)
 assert.equal((await db.query<{n:number}>(`select count(*)::integer n from fixer_employee_reads where request_id=$1 and allowed`,[f])).rows[0].n,1,'Sensitive retrieval has a private durable per-request audit')
 const blocked=await db.query<{r:{error:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[f,fl,'read_personal_email',{}])
 assert.equal(blocked.rows[0].r.error,'held','Even approved requests cannot access personal sources')
 assert.equal((await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[f,fl,'complete','NEVER DISCLOSE'])).rows[0].r,false)
 await assert.rejects(db.exec(`update fixer_privacy_requests set message='changed' where id='${f}'`),/immutable/i)

 const dyn='20000000-0000-4000-8000-000000000003'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[dyn,u,'Tell me about Test job',null])
 const dl=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r.lease_token
 assert.equal((await db.query<{r:{error:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[dyn,'30000000-0000-4000-8000-000000000099','list_jobs',{}])).rows[0].r.error,'lease_ended')
 await db.exec(`update user_permissions set can_view=false where user_id='${u}' and module='budget'`)
 assert.equal((await db.query<{r:{error:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[dyn,dl,'read_job_finance',{job_id:id}])).rows[0].r.error,'held')
 const frozen=(await db.query<{scope:{category:string,job_ids:string[],tools:string[]}}>('select scope from fixer_privacy_requests where id=$1',[dyn])).rows[0].scope
 assert.equal(frozen.category,'job_finance');assert.deepEqual(frozen.tools,['read_job_finance']);assert.deepEqual(frozen.job_ids,[id],'Dynamic sensitive attempt freezes exact record IDs even when requester lacks base access')

 await db.exec(`update users set phone='(513) 555-0123' where id='${u}'`)
 const notify='20000000-0000-4000-8000-000000000010'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[notify,u,'What is scheduled?',null])
 const nj=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 await db.query('select update_fixer_employee_request($1,$2,$3,$4)',[notify,nj.lease_token,'complete','Test job is active.'])
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_delivery() r')).rows[0].r,null,'A request submitted without a phone never texts a newly added number')
 const delivery=await db.query<{r:{request_id:string,phone:string,lease:string,body:string}}>('select claim_fixer_employee_delivery() r')
 assert.equal(delivery.rows[0].r.request_id,notify)
 assert.equal(delivery.rows[0].r.phone,'+15135550123','Saved admin-managed account phone is the only destination')
 assert.equal(delivery.rows[0].r.body,'Test job is active.')
 const dlease=delivery.rows[0].r.lease
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_delivery() r')).rows[0].r,null,'No duplicate provider send while claimed')
 await db.query('select finish_fixer_employee_delivery($1,$2,$3,$4)',[notify,dlease,'accepted','SM'+'b'.repeat(32)])
 const reconcile=await db.query<{r:{action:string,provider_sid:string}}>('select claim_fixer_employee_delivery() r')
 assert.equal(reconcile.rows[0].r.action,'reconcile');assert.equal(reconcile.rows[0].r.provider_sid,'SM'+'b'.repeat(32))
 await db.query('select finish_fixer_employee_delivery($1,$2,$3,$4)',[notify,dlease,'delivered','SM'+'b'.repeat(32)])
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_delivery() r')).rows[0].r,null)

 await db.exec(`update user_permissions set can_view=true where user_id='${u}' and module='budget';
 insert into actuals values('${id}','${id}',77,'approved','2026-10-28');`)

 await db.query('select decide_fixer_privacy_request($1,$2,$3,$4)',[dyn,'+15133480483',true,'SM'+'f'.repeat(32)])
 const resumed=(await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 assert.equal(resumed.id,dyn)
 const scopedExtra=(await db.query<{r:{error?:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[dyn,resumed.lease_token,'read_job_actuals',{job_id:id}])).rows[0].r
 assert.equal(scopedExtra.error,'held','Resumed dynamic approval may use only its exact frozen tool, not a generic financial approval')
 const fin2='20000000-0000-4000-8000-000000000004'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[fin2,u,'What are actual costs on Test job?',null])
 await db.query('select decide_fixer_privacy_request($1,$2,$3,$4)',[fin2,'+15133480483',true,'SM'+'c'.repeat(32)])
 const job2=(await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 assert.equal(job2.id,fin2)
 const actual=await db.query<{r:{data:Array<{total_approved_actuals:number}>}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[fin2,job2.lease_token,'read_job_actuals',{job_id:id}])
 assert.equal(actual.rows[0].r.data[0].total_approved_actuals,77,'Approved actuals are scoped aggregates, not vendor/payroll records')
 await db.query('select update_fixer_employee_request($1,$2,$3,$4)',[fin2,job2.lease_token,'complete','Sensitive test result'])
 const sn=(await db.query<{r:{body:string}}>('select claim_fixer_employee_delivery() r')).rows[0].r
 assert.doesNotMatch(sn.body,/Sensitive test result/,'Sensitive SMS contains only an authenticated app notification')

 const cp='20000000-0000-4000-8000-000000000005'
 await db.exec(`alter table users add column hourly_rate numeric, add column overtime_rate numeric;
 update users set hourly_rate=21,overtime_rate=31 where id='${o}';
 insert into user_permissions values('${u}','admin',true,true);`)
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[cp,u,'What is August hourly compensation?',null])
 await db.query('select decide_fixer_privacy_request($1,$2,$3,$4)',[cp,'+15133480483',true,'SM'+'d'.repeat(32)])
 const cj=(await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 assert.equal(cj.id,cp)
 const pay=(await db.query<{r:{data:Array<{hourly_rate:number}>}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[cp,cj.lease_token,'read_compensation',{person_id:o}])).rows[0].r
 assert.equal(pay.data[0].hourly_rate,21)
 const wrong=(await db.query<{r:{error:string}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[cp,cj.lease_token,'read_compensation',{person_id:u}])).rows[0].r
 assert.equal(wrong.error,'held','Pay approval never grants another person')
 const re='20000000-0000-4000-8000-000000000006'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[re,u,'What is scheduled?',null])
 const first=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 await db.exec(`update fixer_privacy_requests set lease_until=now()-interval '1 second' where id='${re}'`)
 const second=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 assert.notEqual(second.lease_token,first.lease_token)
 assert.equal((await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[re,first.lease_token,'complete','stale answer'])).rows[0].r,false)
 await db.exec(`update fixer_privacy_requests set expires_at=now()-interval '1 second' where id='${re}'`)
 assert.equal((await db.query<{r:boolean}>('select update_fixer_employee_request($1,$2,$3,$4) r',[re,second.lease_token,'complete','expired answer'])).rows[0].r,false)
 await db.exec(`insert into users(id,is_active,phone,full_name) values('10000000-0000-4000-8000-000000000099',true,'+15135550123','Duplicate');`)
 assert.equal((await db.query<{r:string|null}>('select fixer_employee_unique_phone($1) r',[u])).rows[0].r,null,'Duplicate active phones cannot receive answers')
 await db.exec('set role authenticated')
 await assert.rejects(db.query('select claim_fixer_employee_request()'),/permission denied/i)
 await assert.rejects(db.query('select * from fixer_employee_delivery'),/permission denied/i)
 await db.exec('reset role')

 await db.exec(`update users set phone='+15135550124' where id='${u}';update users set is_active=false where id='10000000-0000-4000-8000-000000000099';`)
 const changed='20000000-0000-4000-8000-000000000007'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[changed,u,'What is scheduled?',null])
 const ch=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 await db.query('select update_fixer_employee_request($1,$2,$3,$4)',[changed,ch.lease_token,'complete','Old destination answer'])
 await db.exec(`update users set phone='+15135550125' where id='${u}'`)
 const changedClaim=(await db.query<{r:{request_id:string}|null}>('select claim_fixer_employee_delivery() r')).rows[0].r
 assert.equal(changedClaim,null,'Changing an admin-managed phone cancels previous answer delivery, never retargets it')

 const noManage='20000000-0000-4000-8000-000000000008'
 await db.exec(`update user_permissions set can_manage=false where user_id='${u}' and module='admin'`)
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[noManage,u,'What is August hourly compensation?',null])
 await db.query('select decide_fixer_privacy_request($1,$2,$3,$4)',[noManage,'+15133480483',true,'SM'+'e'.repeat(32)])
 const nm=(await db.query<{r:{id:string,lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 assert.equal(nm.id,noManage)
 const nr=(await db.query<{r:{error?:string,data?:unknown}}>('select read_fixer_employee_tool($1,$2,$3,$4) r',[noManage,nm.lease_token,'read_compensation',{person_id:o}])).rows[0].r
 assert.equal(nr.error,'held');assert.equal(nr.data,undefined,'Admin view without admin manage is not authorized to read pay, even after approval')

 await db.exec(`update user_permissions set can_manage=false where user_id='${o}' and module='admin'`)
 const ownerRevoked=(await db.query<{r:Array<{id:string,result?:string}>}>('select list_fixer_employee_requests($1) r',[u])).rows[0].r
 assert.equal(ownerRevoked.find(r=>r.id===fin2)!.result,undefined,'Revoked approver authority invalidates sensitive disclosure')

 const crash='20000000-0000-4000-8000-000000000009'
 await db.query('select enqueue_fixer_employee_request($1,$2,$3,$4)',[crash,u,'What is scheduled?',null])
 const crashJob=(await db.query<{r:{lease_token:string}}>('select claim_fixer_employee_request() r')).rows[0].r
 await db.query('select update_fixer_employee_request($1,$2,$3,$4)',[crash,crashJob.lease_token,'complete','Synthetic crash recovery answer'])
 const beforeCrash=(await db.query<{r:{request_id:string}}>('select claim_fixer_employee_delivery() r')).rows[0].r
 assert.equal(beforeCrash.request_id,crash)
 await db.exec(`update fixer_employee_delivery set claimed_at=now()-interval '3 minutes' where request_id='${crash}'`)
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_delivery() r')).rows[0].r,null)
 assert.equal((await db.query<{state:string}>(`select state from fixer_employee_delivery where request_id='${crash}'`)).rows[0].state,'unknown','Crashed send needs provider reconciliation, never automatic replay')
 assert.equal((await db.query<{r:unknown}>('select claim_fixer_employee_delivery() r')).rows[0].r,null)
 assert.equal((await db.query<{r:string|null}>(`select fixer_employee_phone('+0123456789') r`)).rows[0].r,null,'Malformed E.164 cannot enable SMS promises')
 await db.close();console.log('PASS employee worker database')
}
main().catch(e=>{console.error(e);process.exitCode=1})
