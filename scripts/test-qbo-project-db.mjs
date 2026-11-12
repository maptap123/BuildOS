import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role service_role; create role authenticated; create role anon;
create table users(id uuid primary key,is_active boolean default true);
create table user_permissions(user_id uuid,module text,can_manage boolean);
create table jobs(id uuid primary key,qb_customer_id text,qb_project_id text,qb_sync_status text,qb_last_synced_at timestamptz,qb_sync_error text);
create table quickbooks_tokens(realm_id text,updated_at timestamptz);
create table job_external_links(id uuid default gen_random_uuid(),job_id uuid,provider text,external_id text,external_parent_id text,display_name text,link_type text,status text,confidence numeric,matched_by text,match_reason text,raw_metadata jsonb default '{}',last_verified_at timestamptz,updated_at timestamptz default now(), unique(job_id,provider,external_id));
insert into users values ('00000000-0000-0000-0000-000000000001',true);
insert into user_permissions values('00000000-0000-0000-0000-000000000001','admin',true);
insert into jobs values('00000000-0000-0000-0000-000000000002','old','old','synced',null,null),('00000000-0000-0000-0000-000000000003',null,null,'not_synced',null,null);
insert into job_external_links(job_id,provider,external_id,status) values('00000000-0000-0000-0000-000000000002','quickbooks','old','linked');
insert into quickbooks_tokens values('realm',now());`)
await db.exec(await readFile('supabase/migrations/20261112120000_quickbooks_project_setup.sql','utf8'))
const actor='00000000-0000-0000-0000-000000000001',job='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003'
assert.equal((await db.query('select qb_customer_id from jobs where id=$1',[job])).rows[0].qb_customer_id,'old','migration preserves existing mappings')
await db.query('select set_job_quickbooks_project($1,0,$2,$3,$4,$5,null)',[job,'10','20','Kitchen',actor])
let j=(await db.query('select * from jobs where id=$1',[job])).rows[0]
assert.equal(j.qb_customer_id,'20');assert.equal(j.qb_project_id,'20');assert.equal(j.qb_parent_customer_id,'10');assert.equal(j.qb_link_version,1)
const links=(await db.query("select external_id,status from job_external_links where job_id=$1 order by external_id",[job])).rows
assert.deepEqual(links,[{external_id:'20',status:'linked'},{external_id:'old',status:'rejected'}])
await assert.rejects(()=>db.query('select set_job_quickbooks_project($1,0,$2,$3,$4,$5,null)',[job,'10','30','Other',actor]),/changed/)
await assert.rejects(()=>db.query('select set_job_quickbooks_project($1,0,$2,$3,$4,$5,null)',[other,'10','20','Kitchen',actor]),/another job/)
await assert.rejects(()=>db.query("update jobs set qb_customer_id='bad' where id=$1",[job]),/explicit/)
await assert.rejects(()=>db.query("update job_external_links set status='linked' where job_id=$1 and external_id='old'",[job]),/explicit/)
// A failure after link replacement must roll back both normalized links and summary.
await db.exec(`create function fail_qb_fixture() returns trigger language plpgsql as $$begin if new.qb_customer_id='999' then raise exception 'fixture save failure';end if;return new;end$$;create trigger fail_qb_fixture before update on jobs for each row execute function fail_qb_fixture();`)
await assert.rejects(()=>db.query('select set_job_quickbooks_project($1,1,$2,$3,$4,$5,null)',[job,'10','999','Failure',actor]),/fixture save failure/)
assert.equal((await db.query('select qb_customer_id from jobs where id=$1',[job])).rows[0].qb_customer_id,'20')
assert.deepEqual((await db.query("select external_id from job_external_links where job_id=$1 and status='linked'",[job])).rows,[{external_id:'20'}])
const claim=async()=>db.query('select claim_job_quickbooks_creation($1,1,$2,$3,$4) as claimed',[job,'10','Addition',actor])
assert.equal((await claim()).rows[0].claimed,true);assert.equal((await claim()).rows[0].claimed,false)
await db.exec(`update users set is_active=false`)
await assert.rejects(()=>db.query('select set_job_quickbooks_project($1,1,$2,$3,$4,$5,null)',[job,'10','30','Other',actor]),/administrator/)
console.log('PASS database: preserve mappings, atomic replace, stale version, duplicate project, auto-match guard, durable claim, inactive user')
await db.close()
