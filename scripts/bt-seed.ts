/**
 * BuilderTrend → Supabase Seed Script
 *
 * Reads bt-export/ and loads into Supabase:
 *   • jobs              (from bt-export/jobs.json)
 *   • schedule_items    (from bt-export/by-job/{id}/calendar.json)
 *
 * Uses the service-role key to bypass RLS.
 * Safe to re-run — jobs are upserted on job_number and schedule items on
 * bt_event_id. The schedule upsert needs migration 050; before it, this script
 * plain-INSERTed calendar rows and a second run duplicated all 4,110 of them.
 *
 * Usage:
 *   npx tsx scripts/bt-seed.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── env ──────────────────────────────────────────────────────────────────────
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OUTPUT_DIR = join(process.cwd(), 'bt-export');

// ─── helpers ──────────────────────────────────────────────────────────────────
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

// BT uses "0001-01-01" and "2055-01-01" as "no date" sentinels
function parseDate(dt: string | null | undefined): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year <= 1 || year >= 2050) return null;
  return d.toISOString().split('T')[0];
}

type BtJob = {
  jobId: number;
  jobName: string;
  ownerDisplayName: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  street?: string;
  addressWithoutStreet?: string;
  city?: string;
  state?: string;
  zip?: string;
  isClosed?: boolean;
  status?: number;
  actualStartDate?: string;
  projectedStartDate?: string;
  projectedClosingDate?: string;
};

/**
 * Map a BuilderTrend job status to a BuildOS one.
 *
 * Do NOT use `isClosed` -- BT returns it as false on every job, including all
 * 223 that are genuinely closed, so trusting it marks the entire book active.
 * `status` is the real field: 0 closed, 1 open, 3 active, 4 presale. BuildOS
 * has no distinct "open", so 1 and 3 both land on 'active'; the BT distinction
 * is kept in jobs.tags by bt-sync-job-metadata.ts.
 */
function mapJobStatus(j: BtJob): 'closed' | 'presale' | 'active' {
  switch (j.status) {
    case 0: return 'closed';
    case 4: return 'presale';
    case 1:
    case 3: return 'active';
    default: return j.isClosed ? 'closed' : 'active';
  }
}

type CalendarResponse = {
  success: boolean;
  data: Array<{
    id: number;
    title?: string;
    name?: string;
    itemStartDate: string;
    itemEndDate: string;
  }> | null;
};

// ─── migration user ───────────────────────────────────────────────────────────
async function ensureMigrationUser(): Promise<string> {
  const email = 'migration@jdc-platform.internal';

  // Look the user up in public.users, NOT via auth.admin.listUsers -- that
  // endpoint returns HTTP 500 "Database error finding users" on this project,
  // so it silently reported no users and we fell through to createUser, which
  // then failed with "already been registered".
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    console.log(`  Reusing migration user: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: 'Migration System' },
  });
  if (error) throw new Error(`Could not create migration user: ${error.message}`);

  // Ensure the trigger-created public.users row exists
  await supabase
    .from('users')
    .upsert({ id: data.user.id, email, full_name: 'Migration System' }, { onConflict: 'id', ignoreDuplicates: true });

  console.log(`  Created migration user: ${data.user.id}`);
  return data.user.id;
}

// ─── jobs ─────────────────────────────────────────────────────────────────────
async function seedJobs(jobs: BtJob[], createdBy: string): Promise<Map<number, string>> {
  const rows = jobs.map((j) => ({
    job_number: String(j.jobId),
    name: j.jobName,
    client_name:
      j.ownerDisplayName ||
      `${j.ownerFirstName ?? ''} ${j.ownerLastName ?? ''}`.trim() ||
      'Unknown',
    site_address: j.street || j.addressWithoutStreet || 'Address not provided',
    city: j.city || null,
    state: j.state || null,
    postal_code: j.zip || null,
    status: mapJobStatus(j),
    start_date: parseDate(
      j.actualStartDate && !j.actualStartDate.startsWith('0001')
        ? j.actualStartDate
        : j.projectedStartDate
    ),
    target_completion_date: parseDate(j.projectedClosingDate),
    created_by: createdBy,
  }));

  const BATCH = 50;

  // BuildOS is the system of record for jobs now (crew live 2026-11-02), and
  // jobs get edited there -- name, status, dates, PM. Only INSERT jobs that BT
  // has and BuildOS doesn't; never overwrite an existing one. Status/date
  // repair for existing jobs is bt-sync-job-metadata.ts's job, behind --apply.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('jobs')
      .upsert(batch, { onConflict: 'job_number', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Jobs insert batch ${i}–${i + batch.length}: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  console.log(`  ${inserted} new jobs inserted, ${rows.length - inserted} already present (left untouched)`);

  const btIdToUuid = new Map<number, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('jobs').select('id, job_number').range(from, from + 999);
    if (error) throw new Error(`Jobs lookup: ${error.message}`);
    for (const row of data ?? []) if (row.job_number) btIdToUuid.set(parseInt(row.job_number), row.id);
    if (!data || data.length < 1000) break;
  }

  return btIdToUuid;
}

// Rows touched in BuildOS on/after go-live belong to the crew; never revert them.
const GO_LIVE = '2026-11-02';

// ─── schedule items ───────────────────────────────────────────────────────────
async function seedScheduleItems(
  btIdToUuid: Map<number, string>,
  jobs: BtJob[],
  createdBy: string
): Promise<number> {
  const existing = new Map<string, { id: string; updated_at: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('schedule_items')
      .select('id, bt_event_id, updated_at')
      .not('bt_event_id', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`Schedule lookup: ${error.message}`);
    for (const row of data ?? []) existing.set(row.bt_event_id, row);
    if (!data || data.length < 1000) break;
  }

  const items: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; row: Record<string, unknown> }> = [];
  let protectedCount = 0;

  for (const job of jobs) {
    const jobUuid = btIdToUuid.get(job.jobId);
    if (!jobUuid) continue;

    const calPath = join(OUTPUT_DIR, 'by-job', String(job.jobId), 'calendar.json');
    const cal = readJson<CalendarResponse>(calPath);
    if (!cal?.success || !Array.isArray(cal.data)) continue;

    for (const item of cal.data) {
      const startDate = parseDate(item.itemStartDate);
      const endDate = parseDate(item.itemEndDate);
      if (!startDate || !endDate) continue;
      // bt_event_id is the BuilderTrend calendar item id. Carrying it is what
      // makes this seeder re-runnable -- without it the insert below duplicated
      // every row on a second run. Requires migration 050.
      const prior = existing.get(String(item.id));
      if (prior) {
        // BT only carries title + dates. Leave status, progress, assignee and
        // sort order alone -- those are BuildOS's -- and skip rows the crew
        // has edited since go-live.
        if (prior.updated_at >= GO_LIVE) { protectedCount++; continue; }
        updates.push({
          id: prior.id,
          row: { job_id: jobUuid, title: item.title || item.name || 'Untitled', start_date: startDate, end_date: endDate },
        });
        continue;
      }
      items.push({
        job_id: jobUuid,
        bt_event_id: String(item.id),
        title: item.title || item.name || 'Untitled',
        start_date: startDate,
        end_date: endDate,
        status: 'not_started',
        sort_order: 0,
        created_by: createdBy,
      });
    }
  }

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const { error } = await supabase
      .from('schedule_items')
      .upsert(batch, { onConflict: 'bt_event_id' });
    if (error) throw new Error(`Schedule items batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${items.length} schedule items inserted\r`);
  }

  let changed = 0;
  for (const { id, row } of updates) {
    const { error } = await supabase.from('schedule_items').update(row).eq('id', id);
    if (error) throw new Error(`Schedule item update ${id}: ${error.message}`);
    changed++;
    if (changed % 200 === 0) process.stdout.write(`  ${changed}/${updates.length} schedule items refreshed\r`);
  }
  console.log(`  ${inserted} new, ${changed} refreshed from BT, ${protectedCount} skipped (edited in BuildOS since ${GO_LIVE})`);

  return inserted;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nJDC Platform — bt-export → Supabase\n');

  console.log('[1/4] Ensuring migration user...');
  const createdBy = await ensureMigrationUser();

  console.log('\n[2/4] Reading jobs.json...');
  const jobs = readJson<BtJob[]>(join(OUTPUT_DIR, 'jobs.json'));
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found or empty');
  console.log(`  ${jobs.length} jobs found`);

  console.log('\n[3/4] Seeding jobs...');
  const btIdToUuid = await seedJobs(jobs, createdBy);
  console.log(`  ✓ ${btIdToUuid.size} jobs upserted          `);

  console.log('\n[4/4] Seeding schedule items...');
  const scheduleCount = await seedScheduleItems(btIdToUuid, jobs, createdBy);
  console.log(`  ✓ ${scheduleCount} schedule items inserted  `);

  console.log('\n─────────────────────────────────────────');
  console.log('✓ Seed complete');
  console.log(`  Jobs          : ${btIdToUuid.size}`);
  console.log(`  Schedule items: ${scheduleCount}`);
  console.log('─────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error('\nFatal:', e.message ?? e);
  process.exit(1);
});
