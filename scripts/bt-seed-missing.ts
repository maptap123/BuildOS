/**
 * BuilderTrend → Supabase: Seed Logs & Contacts
 *
 * Reads bt-export/by-job/{id}/logs.json and contacts.json and loads into:
 *   • daily_logs  — one row per log entry per job
 *   • contacts    — deduplicated by bt_contact_id across all jobs
 *
 * Safe to re-run:
 *   - Logs: updates/inserts by Buildertrend bt_log_id
 *   - Contacts: skips contacts whose bt_contact_id is already present
 *
 * Usage:
 *   npx tsx scripts/bt-seed-missing.ts
 *   npx tsx scripts/bt-seed-missing.ts --job-id 30914203
 *   npx tsx scripts/bt-seed-missing.ts --limit 5
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

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OUTPUT_DIR = join(process.cwd(), 'bt-export');

function argValue(name: string): string | null {
  const exact = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const jobIdArg = argValue('--job-id');
const limitArg = argValue('--limit');

// ─── helpers ──────────────────────────────────────────────────────────────────
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as T; }
  catch { return null; }
}

function parseDateOnly(dt: string | null | undefined): string | null {
  if (!dt) return null;
  // BT "date" field: "2-28-2024" — parse manually
  const slash = dt.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  // ISO-ish: "2024-02-28T05:00:00"
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y <= 1 || y >= 2050) return null;
  return d.toISOString().split('T')[0];
}

function parseTimestamp(dt: string | null | undefined): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() <= 1 || d.getFullYear() >= 2050) return null;
  return d.toISOString();
}

function numericOrNull(value: string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function weatherSummary(log: BtLog) {
  const weather = log.weatherInformation;
  if (!weather) return null;
  const parts = [
    weather.conditions,
    weather.precip ? `${weather.precip}" precip` : null,
    weather.maxWindSpeed ? `${weather.maxWindSpeed} mph wind` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function legacyLogKey(row: {
  job_id: string;
  log_date: string;
  author_name?: string | null;
  work_performed?: string | null;
}) {
  return [
    row.job_id,
    row.log_date,
    normalizeText(row.author_name).toLowerCase(),
    normalizeText(row.work_performed).toLowerCase(),
  ].join('|');
}

// ─── types ────────────────────────────────────────────────────────────────────
type BtJob = { jobId: number; jobName: string };

type BtLog = {
  id: number;
  date: string;
  addedBy: string;
  notes: string | null;
  dateCreated: string;
  logDate: string;
  logTitle?: string | null;
  weatherInformation?: {
    maxTemp?: string | null;
    minTemp?: string | null;
    conditions?: string | null;
    precip?: string | null;
    maxWindSpeed?: string | null;
  } | null;
};

type LogsResponse = {
  success: boolean;
  data: { dailyLogs: BtLog[] } | null;
};

type BtContact = {
  id: number;
  builderId: number;
  displayName: { title: string };
  phone?: string;
  cell?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type ContactsResponse = {
  success: boolean;
  data: { data: BtContact[] } | null;
};

type ExistingLog = {
  id: string;
  job_id?: string;
  bt_log_id: string | null;
  log_date?: string;
  author_name?: string | null;
  work_performed?: string | null;
};

// ─── migration user ───────────────────────────────────────────────────────────
async function getMigrationUserId(): Promise<string> {
  const email = 'migration@jdc-platform.internal';
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) return existing.id;
  throw new Error('Migration user not found — run bt-seed.ts first');
}

// ─── seed logs ────────────────────────────────────────────────────────────────
async function seedLogs(
  btIdToUuid: Map<number, string>,
  jobs: BtJob[],
  createdBy: string
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const { data: existingRows, error: existingError } = await supabase
    .from('daily_logs')
    .select('id, job_id, bt_log_id, log_date, author_name, work_performed')
    .limit(100000);
  if (existingError) throw new Error(`Existing logs lookup: ${existingError.message}`);

  const existingByBtLogId = new Map(
    ((existingRows ?? []) as ExistingLog[])
      .filter(row => row.bt_log_id)
      .map(row => [row.bt_log_id!, row.id])
  );
  const legacyByKey = new Map<string, ExistingLog[]>();
  for (const row of (existingRows ?? []) as ExistingLog[]) {
    if (row.bt_log_id || !row.job_id || !row.log_date) continue;
    const key = legacyLogKey({
      job_id: row.job_id,
      log_date: row.log_date,
      author_name: row.author_name,
      work_performed: row.work_performed,
    });
    const matches = legacyByKey.get(key) ?? [];
    matches.push(row);
    legacyByKey.set(key, matches);
  }

  const inserts: object[] = [];
  const updates: Array<{ id: string; row: object }> = [];
  const skipped = 0;

  for (const { jobId } of jobs) {
    const jobUuid = btIdToUuid.get(jobId);
    if (!jobUuid) continue;

    const logsPath = join(OUTPUT_DIR, 'by-job', String(jobId), 'logs.json');
    const resp = readJson<LogsResponse>(logsPath);
    if (!resp?.success || !resp.data?.dailyLogs?.length) continue;

    for (const log of resp.data.dailyLogs) {
      const logDate = parseDateOnly(log.logDate ?? log.date);
      if (!logDate) continue;

      const row = {
        job_id: jobUuid,
        bt_log_id: String(log.id),
        log_date: logDate,
        logged_at: parseTimestamp(log.dateCreated) ?? parseTimestamp(log.logDate),
        author_name: log.addedBy || null,
        weather_summary: weatherSummary(log),
        temperature_high: numericOrNull(log.weatherInformation?.maxTemp),
        temperature_low: numericOrNull(log.weatherInformation?.minTemp),
        work_performed: log.notes?.trim() || log.logTitle?.trim() || null,
        created_by: createdBy,
      };

      const existingId = existingByBtLogId.get(String(log.id));
      if (existingId) updates.push({ id: existingId, row });
      else {
        const legacyMatches = legacyByKey.get(legacyLogKey(row));
        const legacy = legacyMatches?.shift();
        if (legacy) updates.push({ id: legacy.id, row });
        else inserts.push(row);
      }
    }
  }

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase.from('daily_logs').insert(batch);
    if (error) throw new Error(`daily_logs batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${inserts.length} logs inserted\r`);
  }

  let updated = 0;
  for (const update of updates) {
    const { error } = await supabase.from('daily_logs').update(update.row).eq('id', update.id);
    if (error) throw new Error(`daily_logs update ${update.id}: ${error.message}`);
    updated++;
    if (updated % BATCH === 0) process.stdout.write(`  ${updated}/${updates.length} logs updated\r`);
  }

  return { inserted, updated, skipped };
}

// ─── seed contacts ────────────────────────────────────────────────────────────
async function seedContacts(
  jobs: BtJob[],
  createdBy: string
): Promise<{ inserted: number; skipped: number }> {
  // Collect all unique contacts by BT id
  const byBtId = new Map<number, BtContact>();

  for (const { jobId } of jobs) {
    const path = join(OUTPUT_DIR, 'by-job', String(jobId), 'contacts.json');
    const resp = readJson<ContactsResponse>(path);
    if (!resp?.success || !resp.data?.data?.length) continue;

    for (const c of resp.data.data) {
      if (!byBtId.has(c.id)) byBtId.set(c.id, c);
    }
  }

  console.log(`  ${byBtId.size} unique contacts found across all jobs`);

  // Find which bt_contact_ids are already in the DB
  const { data: existingRows } = await supabase
    .from('contacts')
    .select('bt_contact_id')
    .limit(10000);
  const existingBtIds = new Set(
    (existingRows ?? []).map((r: { bt_contact_id: string }) => r.bt_contact_id)
  );

  const rows: object[] = [];
  for (const [btId, c] of byBtId) {
    if (existingBtIds.has(String(btId))) continue;

    const fullName = c.displayName?.title?.trim();
    if (!fullName) continue;

    rows.push({
      full_name: fullName,
      email: c.email || null,
      phone: c.phone || c.cell || null,
      address: c.street || null,
      city: c.city || null,
      state: c.state || null,
      postal_code: c.zip || null,
      bt_contact_id: String(btId),
      is_primary: false,
      created_by: createdBy,
    });
  }

  const BATCH = 100;
  let inserted = 0;
  const skipped = byBtId.size - rows.length;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('contacts').insert(batch);
    if (error) throw new Error(`contacts batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${rows.length} contacts inserted\r`);
  }

  return { inserted, skipped };
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nJDC Platform — bt-export (logs+contacts) → Supabase\n');

  console.log('[1/4] Getting migration user...');
  const createdBy = await getMigrationUserId();
  console.log(`  user: ${createdBy}`);

  console.log('\n[2/4] Reading jobs list...');
  const loadedJobs = readJson<BtJob[]>(join(OUTPUT_DIR, 'jobs.json'));
  const jobs = (jobIdArg
    ? loadedJobs?.filter(job => String(job.jobId) === jobIdArg)
    : limitArg
      ? loadedJobs?.slice(0, Number(limitArg))
      : loadedJobs) ?? null;
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found or empty');
  console.log(`  ${jobs.length} jobs${jobIdArg ? ` (job ${jobIdArg})` : limitArg ? ` (limit ${limitArg})` : ''}`);

  console.log('\n[3/4] Looking up job UUIDs...');
  const { data: jobRows, error: jobErr } = await supabase
    .from('jobs')
    .select('id, job_number')
    .limit(1000);
  if (jobErr) throw new Error(`Jobs fetch: ${jobErr.message}`);
  const btIdToUuid = new Map<number, string>();
  for (const row of jobRows ?? []) btIdToUuid.set(parseInt(row.job_number), row.id);
  console.log(`  ${btIdToUuid.size} jobs mapped`);

  console.log('\n[4/5] Seeding daily logs...');
  const { inserted: logsInserted, updated: logsUpdated, skipped: logsSkipped } = await seedLogs(btIdToUuid, jobs, createdBy);
  console.log(`  ✓ ${logsInserted} logs inserted, ${logsUpdated} updated, ${logsSkipped} skipped`);

  console.log('\n[5/5] Seeding contacts...');
  const { inserted: contactsInserted, skipped: contactsSkipped } = await seedContacts(jobs, createdBy);
  console.log(`  ✓ ${contactsInserted} contacts inserted, ${contactsSkipped} already present`);

  console.log('\n─────────────────────────────────────────');
  console.log('✓ Seed complete');
  console.log(`  Daily logs : ${logsInserted} inserted`);
  console.log(`  Contacts   : ${contactsInserted} inserted`);
  console.log('─────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error('\nFatal:', e.message ?? e);
  process.exit(1);
});
