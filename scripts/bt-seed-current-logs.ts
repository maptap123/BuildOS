/**
 * Buildertrend -> Supabase current-job daily log repair.
 *
 * Re-seeds richer daily-log rows for current Buildertrend jobs only
 * (open, active, presale). Unlike the older seed script, this does not skip an
 * entire job just because one log exists. It updates by bt_log_id when possible
 * and inserts missing logs.
 *
 * Requires migration 007_buildertrend_log_metadata.sql.
 *
 * Usage:
 *   npx tsx scripts/bt-seed-current-logs.ts
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
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

const CURRENT_BT_STATUSES = new Set([0, 1, 3, 4]);
const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type BtJob = {
  jobId: number;
  jobName: string;
  status: number;
};

type BtLog = {
  id: number;
  date: string;
  addedBy: string;
  notes: string | null;
  dateCreated: string;
  logDate: string;
  logTitle?: string | null;
  tags?: string | null;
  hasAttachments?: boolean;
  hasPhotos?: boolean;
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

type AppJob = {
  id: string;
  job_number: string;
};

type ExistingLog = {
  id: string;
  bt_log_id: string | null;
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('0001-01-01') || value.startsWith('2006-01-01') || value.startsWith('2055-01-01')) return null;
  const dashed = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashed) return `${dashed[3]}-${dashed[1].padStart(2, '0')}-${dashed[2].padStart(2, '0')}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year <= 1 || year >= 2050) return null;
  return date.toISOString().slice(0, 10);
}

function parseTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year <= 1 || year >= 2050) return null;
  return date.toISOString();
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

async function getMigrationUserId() {
  const email = 'migration@jdc-platform.internal';
  const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Migration user lookup: ${error.message}`);
  const existing = list?.users?.find(user => user.email === email);
  if (!existing) throw new Error('Migration user not found. Run bt-seed.ts first.');
  return existing.id;
}

async function main() {
  const createdBy = await getMigrationUserId();
  const jobs = (readJson<BtJob[]>(join(OUTPUT_DIR, 'jobs.json')) ?? [])
    .filter(job => CURRENT_BT_STATUSES.has(job.status));

  const { data: appJobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, job_number')
    .limit(5000);
  if (jobsError) throw new Error(`Jobs lookup: ${jobsError.message}`);

  const appByBtId = new Map((appJobs ?? []).map((job: AppJob) => [Number(job.job_number), job.id]));

  const { data: existingRows, error: existingError } = await supabase
    .from('daily_logs')
    .select('id, bt_log_id')
    .not('bt_log_id', 'is', null)
    .limit(100000);
  if (existingError) throw new Error(`Existing logs lookup: ${existingError.message}`);

  const existingByBtLogId = new Map(
    ((existingRows ?? []) as ExistingLog[])
      .filter(row => row.bt_log_id)
      .map(row => [row.bt_log_id!, row.id])
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const job of jobs) {
    const jobUuid = appByBtId.get(job.jobId);
    if (!jobUuid) {
      skipped++;
      continue;
    }

    const response = readJson<LogsResponse>(join(OUTPUT_DIR, 'by-job', String(job.jobId), 'logs.json'));
    const logs = response?.success ? response.data?.dailyLogs ?? [] : [];

    for (const log of logs) {
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
      if (existingId) {
        const { error } = await supabase.from('daily_logs').update(row).eq('id', existingId);
        if (error) throw new Error(`Update log ${log.id}: ${error.message}`);
        updated++;
      } else {
        const { data, error } = await supabase.from('daily_logs').insert(row).select('id').single();
        if (error) throw new Error(`Insert log ${log.id}: ${error.message}`);
        if (data?.id) existingByBtLogId.set(String(log.id), data.id);
        inserted++;
      }
    }
  }

  console.log('\nBuildertrend current-job logs seeded');
  console.log(`  Jobs considered: ${jobs.length}`);
  console.log(`  Logs inserted  : ${inserted}`);
  console.log(`  Logs updated   : ${updated}`);
  console.log(`  Jobs skipped   : ${skipped}`);
}

main().catch(error => {
  console.error('\nFatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
