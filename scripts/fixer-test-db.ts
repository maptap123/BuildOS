import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

export async function createFixerTestDb() {
  const db = new PGlite()
  // Minimal pre-046 schema fixture. The new migration itself runs unchanged.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(id uuid primary key);
    create table estimates(id uuid primary key,lead_id uuid,is_locked boolean default false);
    create table estimate_lines(id uuid primary key default gen_random_uuid(),estimate_id uuid,lead_id uuid,
      description text,phase text,cost_code text,uom text,quantity numeric,unit_cost numeric,labor_cost numeric,
      material_cost numeric,sub_cost numeric,markup_pct numeric,sort_order int,source text,source_line_id uuid,
      cost_item_id uuid,comp_job_id uuid,comp_label text,ai_rationale text);
    create table estimate_line_proposals(id uuid primary key default gen_random_uuid(),estimate_id uuid,batch_id uuid,
      description text,name_status text,suggested_description text,phase text,cost_code text,uom text,quantity numeric,
      unit_cost numeric,labor_cost numeric,material_cost numeric,sub_cost numeric,markup_pct numeric,sort_order int,
      source text,source_line_id uuid,cost_item_id uuid,comp_job_id uuid,comp_estimate_id uuid,comp_label text,
      ai_rationale text,status text default 'pending',applied_line_id uuid,decided_by uuid,decided_at timestamptz);
    grant all on all tables in schema public to service_role;
  `)
  await db.exec(await readFile('supabase/migrations/20260909172926_fixer_background_requests.sql', 'utf8'))
  return db
}
