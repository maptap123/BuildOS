/**
 * Buildertrend -> Supabase job metadata correction.
 *
 * Corrects the first import pass by syncing:
 *   - job status from Buildertrend buckets
 *   - tags: buildertrend, plus open/closed/presale/current
 *   - created_at from Buildertrend dateOpened
 *   - start/target dates with Buildertrend sentinel dates removed
 *
 * Defaults to dry-run. Pass --apply to write changes.
 *
 * Usage:
 *   npx tsx scripts/bt-sync-job-metadata.ts
 *   npx tsx scripts/bt-sync-job-metadata.ts --apply
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

const APPLY = process.argv.includes('--apply');

type AppJobStatus = 'lead' | 'estimating' | 'scheduled' | 'active' | 'on_hold' | 'completed' | 'closed';

type BtJob = {
  jobId: number;
  jobName: string;
  status: number;
  isClosed?: boolean;
  dateOpened?: string;
  projectedStartDate?: string;
  actualStartDate?: string;
  projectedClosingDate?: string;
};

type AppJob = {
  id: string;
  job_number: string;
  name: string;
  status: AppJobStatus;
  tags: string[] | null;
  created_at: string;
  start_date: string | null;
  target_completion_date: string | null;
};

const STATUS_MAP: Record<number, { appStatus: AppJobStatus; btTag: string; current: boolean }> = {
  0: { appStatus: 'closed', btTag: 'closed', current: false },
  1: { appStatus: 'scheduled', btTag: 'open', current: true },
  3: { appStatus: 'active', btTag: 'active', current: true },
  4: { appStatus: 'estimating', btTag: 'presale', current: true },
};

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('0001-01-01') || value.startsWith('2006-01-01') || value.startsWith('2055-01-01')) return null;
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

function uniqueTags(tags: Array<string | null | undefined>) {
  return [...new Set(tags.map(tag => tag?.trim().toLowerCase()).filter(Boolean) as string[])].sort();
}

function sameArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function desiredFor(job: BtJob, existing?: AppJob) {
  const mapped = STATUS_MAP[job.status] ?? { appStatus: 'active' as AppJobStatus, btTag: `bt-status-${job.status}`, current: true };
  const openedAt = parseTimestamp(job.dateOpened);
  const startDate = parseDateOnly(
    job.actualStartDate && !job.actualStartDate.startsWith('0001')
      ? job.actualStartDate
      : job.projectedStartDate
  );
  const targetDate = parseDateOnly(job.projectedClosingDate);
  const existingTags = existing?.tags ?? [];
  const tags = uniqueTags([
    ...existingTags.filter(tag => !['buildertrend', 'open', 'closed', 'presale', 'active', 'current', 'historical'].includes(tag.toLowerCase())),
    'buildertrend',
    mapped.btTag,
    mapped.current ? 'current' : 'historical',
  ]);

  return {
    status: mapped.appStatus,
    tags,
    created_at: openedAt,
    start_date: startDate,
    target_completion_date: targetDate,
  };
}

async function main() {
  const btJobs = JSON.parse(
    readFileSync(join(process.cwd(), 'bt-export', 'jobs.json'), 'utf-8')
  ) as BtJob[];

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: appJobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, name, status, tags, created_at, start_date, target_completion_date')
    .limit(5000);

  if (error) throw new Error(`Fetch jobs: ${error.message}`);

  const appByJobNumber = new Map((appJobs ?? []).map(job => [job.job_number, job as AppJob]));
  const changes: Array<{ existing: AppJob; desired: ReturnType<typeof desiredFor>; reasons: string[] }> = [];
  const missing: BtJob[] = [];

  for (const btJob of btJobs) {
    const existing = appByJobNumber.get(String(btJob.jobId));
    if (!existing) {
      missing.push(btJob);
      continue;
    }

    const desired = desiredFor(btJob, existing);
    const reasons: string[] = [];
    if (existing.status !== desired.status) reasons.push(`status ${existing.status} -> ${desired.status}`);
    if (!sameArray([...(existing.tags ?? [])].sort(), desired.tags)) reasons.push('tags');
    if (desired.created_at && existing.created_at !== desired.created_at) reasons.push('created_at');
    if (existing.start_date !== desired.start_date) reasons.push(`start_date ${existing.start_date ?? 'null'} -> ${desired.start_date ?? 'null'}`);
    if (existing.target_completion_date !== desired.target_completion_date) {
      reasons.push(`target_completion_date ${existing.target_completion_date ?? 'null'} -> ${desired.target_completion_date ?? 'null'}`);
    }

    if (reasons.length > 0) changes.push({ existing, desired, reasons });
  }

  console.log(`\nBuildertrend job metadata sync ${APPLY ? '(apply)' : '(dry run)'}\n`);
  console.log(`Buildertrend jobs: ${btJobs.length}`);
  console.log(`Matched app jobs : ${btJobs.length - missing.length}`);
  console.log(`Missing app jobs : ${missing.length}`);
  console.log(`Rows to update   : ${changes.length}`);

  for (const change of changes.slice(0, 20)) {
    console.log(`  ${change.existing.job_number} ${change.existing.name}: ${change.reasons.join(', ')}`);
  }
  if (changes.length > 20) console.log(`  ...${changes.length - 20} more`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply after reviewing the status mapping.');
    return;
  }

  const BATCH = 50;
  let updated = 0;
  for (let index = 0; index < changes.length; index += BATCH) {
    const batch = changes.slice(index, index + BATCH);
    await Promise.all(batch.map(async ({ existing, desired }) => {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: desired.status,
          tags: desired.tags,
          created_at: desired.created_at,
          start_date: desired.start_date,
          target_completion_date: desired.target_completion_date,
        })
        .eq('id', existing.id);
      if (updateError) throw new Error(`Update ${existing.job_number}: ${updateError.message}`);
    }));
    updated += batch.length;
    process.stdout.write(`  ${updated}/${changes.length} jobs updated\r`);
  }

  console.log(`\nDone. Updated ${updated} jobs.`);
}

main().catch(error => {
  console.error('\nFatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
