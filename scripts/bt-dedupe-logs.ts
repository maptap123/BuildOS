/**
 * Remove legacy duplicate daily logs after a corrected Buildertrend import.
 *
 * Keeps rows with bt_log_id and removes older matching rows without bt_log_id
 * for a selected job.
 *
 * Usage:
 *   npx.cmd tsx scripts/bt-dedupe-logs.ts --job-id 30914203
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

function argValue(name: string): string | null {
  const exact = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

type LogRow = {
  id: string;
  bt_log_id: string | null;
  log_date: string;
  author_name: string | null;
  work_performed: string | null;
};

function matchKey(row: LogRow) {
  return [
    row.log_date,
    normalizeText(row.author_name).toLowerCase(),
    normalizeText(row.work_performed).toLowerCase(),
  ].join('|');
}

loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const btJobId = argValue('--job-id');
if (!btJobId) throw new Error('--job-id is required');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, name, job_number')
    .eq('job_number', btJobId)
    .single();
  if (jobError) throw new Error(`Job lookup: ${jobError.message}`);

  const { data: rows, error: rowsError } = await supabase
    .from('daily_logs')
    .select('id, bt_log_id, log_date, author_name, work_performed')
    .eq('job_id', job.id);
  if (rowsError) throw new Error(`Logs lookup: ${rowsError.message}`);

  const correctedKeys = new Set(
    ((rows ?? []) as LogRow[])
      .filter(row => row.bt_log_id)
      .map(matchKey)
  );
  const duplicates = ((rows ?? []) as LogRow[])
    .filter(row => !row.bt_log_id && correctedKeys.has(matchKey(row)));

  console.log(`${job.name} (${btJobId})`);
  console.log(`  Logs before       : ${rows?.length ?? 0}`);
  console.log(`  Legacy duplicates : ${duplicates.length}`);

  if (duplicates.length > 0) {
    const { error: deleteError } = await supabase
      .from('daily_logs')
      .delete()
      .in('id', duplicates.map(row => row.id));
    if (deleteError) throw new Error(`Delete duplicates: ${deleteError.message}`);
  }

  console.log(`  Deleted           : ${duplicates.length}`);
}

main().catch(error => {
  console.error('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
