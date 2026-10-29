import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
const uid='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001'
async function main(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table users(id uuid primary key,is_active boolean);
 create table user_permissions(user_id uuid,module text,can_view boolean,can_manage boolean default false);
 insert into users values('${uid}',true),('${owner}',true);
 insert into user_permissions values('${uid}','ai',true,false),('${owner}','admin',true,true);`)
 const path='supabase/migrations/20261028120000_fixer_privacy_review.sql'
 const sql=await readFile(path,'utf8').catch(()=> '')
 assert.ok(sql,'Privacy migration must exist')
 await db.exec(sql)
 await db.exec(`insert into fixer_privacy_settings(id,approver_user_id) values(true,'${owner}');
 insert into fixer_verified_phones(user_id,phone,verified_by) values('${uid}','+15135550123','${owner}');`)
 await assert.rejects(db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id,uid,'x'.repeat(1001)]),/check constraint/i,'The entire question must fit in the owner approval SMS')
 const queued=await db.query<{r:{id:string,status:string}}>(`select enqueue_fixer_privacy_request($1,$2,$3) r`,[id,uid,'What is the pay on this job?'])
 assert.equal(queued.rows[0].r.status,'held')
 const again=await db.query(`select enqueue_fixer_privacy_request($1,$2,$3) r`,[id,uid,'What is the pay on this job?'])
 assert.deepEqual(again.rows,queued.rows)
 const notices=await db.query(`select * from fixer_privacy_outbox where request_id=$1`,[id]);assert.equal(notices.rows.length,1)
 await assert.rejects(db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id,owner,'other']),/unavailable|used/i)
 await db.exec(`set role authenticated`)
 await assert.rejects(db.query('select * from fixer_privacy_requests'),/permission denied/i)
 await assert.rejects(db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id,uid,'test']),/permission denied/i)
 await db.exec('reset role')
 const functions=await db.query<{present:boolean}>(`select exists(select 1 from pg_proc where proname='decide_fixer_privacy_request') present`)
 assert.equal(functions.rows[0].present,true,'A request-scoped decision RPC must exist')
 const decide=(request:string,phone:string,yes:boolean,sid:string)=>db.query<{r:boolean}>(`select decide_fixer_privacy_request($1,$2,$3,$4) r`,[request,phone,yes,sid])
 assert.equal((await decide(id,'+15135559999',true,'SMwrong')).rows[0].r,false)
 assert.equal((await decide(id,'+15133480483',true,'SMunverified')).rows[0].r,false,'Pinned owner phone must also be verified for the configured approver')
 await db.exec(`insert into fixer_verified_phones(user_id,phone,verified_by) values('${owner}','+15133480483','${owner}')`)
 assert.equal((await decide(id,'+15133480483',true,'SMapproved')).rows[0].r,true)
 assert.equal((await decide(id,'+15133480483',false,'SMopposite')).rows[0].r,false)
 const decided=await db.query<{status:string,decided_by:string}>(`select status,decided_by from fixer_privacy_requests where id=$1`,[id])
 assert.equal(decided.rows[0].status,'approved_waiting_for_secure_worker')
 assert.equal(decided.rows[0].decided_by,owner)
 assert.equal((await decide(id,'+15133480483',true,'SMapproved')).rows[0].r,true,'Exact authenticated replay is harmless')
 const id2='20000000-0000-4000-8000-000000000002'
 await db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id2,uid,'Other question'])
 assert.equal((await decide(id2,'+15133480483',true,'SMapproved')).rows[0].r,false,'A provider event cannot approve a different request')
 await db.exec(`update fixer_privacy_requests set expires_at=now()-interval '1 second' where id='${id2}'`)
 assert.equal((await decide(id2,'+15133480483',true,'SMlate')).rows[0].r,false)
 assert.equal((await db.query<{can_manage:boolean}>(`select can_manage from user_permissions where user_id=$1`,[uid])).rows[0].can_manage,false,'Approval never upgrades requester permissions')
 const claimExists=await db.query<{present:boolean}>(`select exists(select 1 from pg_proc where proname='claim_fixer_privacy_notice') present`)
 assert.equal(claimExists.rows[0].present,true,'A durable notice claim RPC must exist')
 const id3='20000000-0000-4000-8000-000000000003'
 await db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id3,uid,'Schedule question'])
 const claim=await db.query<{r:{request_id:string,lease:string,message:string}|null}>(`select claim_fixer_privacy_notice() r`)
 assert.equal(claim.rows[0].r!.request_id,id3,'Already decided/expired requests are never texted')
 assert.equal(claim.rows[0].r!.message,'Schedule question')
 assert.equal((await db.query<{r:unknown}>(`select claim_fixer_privacy_notice() r`)).rows[0].r,null,'Concurrent poll cannot send a claimed notice twice')
 const lease=claim.rows[0].r!.lease
 assert.equal((await db.query<{r:boolean}>(`select finish_fixer_privacy_notice($1,$2,$3) r`,[id3,'30000000-0000-4000-8000-000000000001','SMsent'])).rows[0].r,false)
 assert.equal((await db.query<{r:boolean}>(`select finish_fixer_privacy_notice($1,$2,$3) r`,[id3,lease,'SMsent'])).rows[0].r,true)
 const id4='20000000-0000-4000-8000-000000000004'
 await db.query(`select enqueue_fixer_privacy_request($1,$2,$3)`,[id4,uid,'Check access'])
 await db.exec(`update users set is_active=false where id='${uid}'`)
 assert.equal((await db.query<{r:unknown}>(`select claim_fixer_privacy_notice() r`)).rows[0].r,null,'Recheck current access immediately before notice delivery')
 await db.close()
 console.log('PASS privacy database: durable scoped hold, idempotency, single notice, verified identity, restricted audit/RPC')
}
main().catch(e=>{console.error(e);process.exitCode=1})
