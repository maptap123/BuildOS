/**
 * BuilderTrend → Supabase Seed Script
 *
 * Reads bt-export/ and loads into Supabase:
 *   • jobs              (from bt-export/jobs.json)
 *   • schedule_items    (from bt-export/by-job/{id}/calendar.json)
 *
 * Uses the service-role key to bypass RLS.
 * Safe to re-run — jobs are upserted on job_number.
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
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
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
  actualStartDate?: string;
  projectedStartDate?: string;
  projectedClosingDate?: string;
};

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

  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);
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
    status: j.isClosed ? 'closed' : 'active',
    start_date: parseDate(
      j.actualStartDate && !j.actualStartDate.startsWith('0001')
        ? j.actualStartDate
        : j.projectedStartDate
    ),
    target_completion_date: parseDate(j.projectedClosingDate),
    created_by: createdBy,
  }));

  const btIdToUuid = new Map<number, string>();
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('jobs')
      .upsert(batch, { onConflict: 'job_number', ignoreDuplicates: false })
      .select('id, job_number');
    if (error) throw new Error(`Jobs upsert batch ${i}–${i + batch.length}: ${error.message}`);
    for (const row of data ?? []) btIdToUuid.set(parseInt(row.job_number), row.id);
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length} jobs upserted\r`);
  }

  return btIdToUuid;
}

// ─── schedule items ───────────────────────────────────────────────────────────
async function seedScheduleItems(
  btIdToUuid: Map<number, string>,
  jobs: BtJob[],
  createdBy: string
): Promise<number> {
  const items: object[] = [];

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
      items.push({
        job_id: jobUuid,
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
    const { error } = await supabase.from('schedule_items').insert(batch);
    if (error) throw new Error(`Schedule items batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${items.length} schedule items inserted\r`);
  }

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
