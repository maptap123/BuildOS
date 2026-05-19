/**
 * Buildertrend status audit.
 *
 * Reads bt-export/jobs.json and prints the job buckets Buildertrend returned.
 * Useful before applying status/tag corrections to Supabase.
 *
 * Usage:
 *   npx tsx scripts/bt-status-audit.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

type BtJob = {
  jobId: number;
  jobName: string;
  status: number;
  isClosed?: boolean;
  dateOpened?: string;
  projectedStartDate?: string;
  actualStartDate?: string;
};

const STATUS_LABELS: Record<number, string> = {
  0: 'closed',
  1: 'open',
  3: 'active',
  4: 'presale',
};

const jobs = JSON.parse(
  readFileSync(join(process.cwd(), 'bt-export', 'jobs.json'), 'utf-8')
) as BtJob[];

const groups = new Map<number, BtJob[]>();
for (const job of jobs) {
  const group = groups.get(job.status) ?? [];
  group.push(job);
  groups.set(job.status, group);
}

console.log('\nBuildertrend job status audit\n');
console.log(`Total jobs: ${jobs.length}`);

for (const [status, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`\nStatus ${status} (${STATUS_LABELS[status] ?? 'unknown'}): ${group.length}`);
  for (const job of group.slice(0, 12)) {
    console.log(
      `  ${job.jobId}  ${job.jobName}  opened=${job.dateOpened ?? 'n/a'}  isClosed=${job.isClosed ?? 'n/a'}`
    );
  }
}

const sentinelStarts = jobs.filter(job => job.projectedStartDate?.startsWith('2006-01-01')).length;
const missingActualStarts = jobs.filter(job => job.actualStartDate?.startsWith('0001-01-01')).length;
console.log('\nDate quality');
console.log(`  projectedStartDate sentinel 2006-01-01: ${sentinelStarts}`);
console.log(`  actualStartDate sentinel 0001-01-01: ${missingActualStarts}`);
console.log('\nReview STATUS_LABELS in this script before running bt-sync-job-metadata.ts.');
