import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role service_role;create role anon;create role authenticated;
create table users(id uuid primary key,is_active boolean);
create table user_permissions(user_id uuid,module text,can_create boolean);
create table leads(id uuid primary key,title text,client_name text,client_email text,client_phone text,address text,notes text,estimated_value numeric,converted_job_id uuid,status text);
create table jobs(id uuid primary key default gen_random_uuid(),job_number text unique,name text,description text,client_name text,client_email text,client_phone text,site_address text,status text,contract_amount numeric,estimated_cost numeric,tags text[],lead_id uuid,created_by uuid,qb_sync_status text,closeout_checklist jsonb);
insert into users values('00000000-0000-0000-0000-000000000001',true);
insert into user_permissions values('00000000-0000-0000-0000-000000000001','jobs',true);
insert into leads(id,title,client_name,status) values('00000000-0000-0000-0000-000000000002','Addition','Homeowner','won');`)
await db.exec(await readFile('supabase/migrations/20261112121000_atomic_lead_job_seed.sql','utf8'))
const convert=()=>db.query('select ensure_lead_conversion_job($1,$2,$3::jsonb) as job',['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',JSON.stringify({status:'presale'})])
const [first,second]=await Promise.all([convert(),convert()]);assert.equal(first.rows[0].job.id,second.rows[0].job.id)
assert.equal((await db.query('select count(*)::int as n from jobs')).rows[0].n,1)
assert.equal((await db.query('select converted_job_id from leads')).rows[0].converted_job_id,first.rows[0].job.id)
// A later QBO/setup failure or dropped HTTP response must only reuse this saved job.
assert.equal((await convert()).rows[0].job.id,first.rows[0].job.id)
console.log('PASS conversion SQL: concurrent/repeated calls reuse one saved job with atomic lead backfill')
await db.close()
