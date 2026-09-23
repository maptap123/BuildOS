#!/usr/bin/env tsx
/**
 * Backfills schedule_items.bt_event_id for rows that were seeded before the
 * column existed.
 *
 * bt-seed.ts built each schedule_items row from a BuilderTrend calendar record
 * but discarded that record's `id`, so the 4,110 existing rows have no BT key
 * and the calendar importer cannot upsert against them. This re-reads the same
 * bt-export/by-job/{btJobId}/calendar.json files, rebuilds the exact mapping
 * bt-seed.ts used, and matches each row on (job_id, title, start_date, end_date).
 *
 * That tuple was verified unique across all 4,110 live rows before this script
 * was written, so the match is unambiguous.
 *
 * Requires migration 050 (adds schedule_items.bt_event_id).
 *
 * Usage:
 *   npx tsx scripts/bt-backfill-schedule-ids.ts            # dry run
 *   npx tsx scripts/bt-backfill-schedule-ids.ts --apply
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));

const APPLY = process.argv.includes('--apply');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Identical to bt-seed.ts:54 -- the mapping must match exactly or nothing lines up.
function parseDate(dt: string | null | undefined): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year <= 1 || year >= 2050) return null;
  return d.toISOString().split('T')[0];
}

type CalItem = { id: number; title?: string; name?: string; itemStartDate?: string; itemEndDate?: string };

/** Page past PostgREST's max-rows cap instead of trusting .limit(). */
async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`\nBackfill schedule_items.bt_event_id  ${APPLY ? '[APPLY]' : '[DRY RUN]'}\n`);

  const probe = await supabase.from('schedule_items').select('bt_event_id').limit(1);
  if (probe.error) {
    console.error(`schedule_items.bt_event_id is missing -- apply migration 050 first.`);
    console.error(`  ${probe.error.message}`);
    process.exit(1);
  }

  const jobs = await fetchAllRows<{ id: string; job_number: string }>('jobs', 'id, job_number');
  const uuidByBtId = new Map(jobs.map((j) => [j.job_number, j.id]));
  console.log(`  ${jobs.length} jobs, ${uuidByBtId.size} job_number keys`);

  const rows = await fetchAllRows<{
    id: string; job_id: string; title: string; start_date: string; end_date: string; bt_event_id: string | null;
  }>('schedule_items', 'id, job_id, title, start_date, end_date, bt_event_id');
  console.log(`  ${rows.length} schedule_items (${rows.filter((r) => r.bt_event_id).length} already keyed)`);

  const key = (jobUuid: string, title: string, s: string, e: string) => `${jobUuid}|${title}|${s}|${e}`;
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = key(r.job_id, r.title, r.start_date, r.end_date);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }

  const byJobDir = join(OUTPUT_DIR, 'by-job');
  if (!existsSync(byJobDir)) {
    console.error(`bt-export/by-job/ not found -- nothing to backfill from.`);
    process.exit(1);
  }

  const updates: { id: string; bt_event_id: string }[] = [];
  let scanned = 0, noJob = 0, noMatch = 0, ambiguous = 0, alreadySet = 0;

  for (const btJobId of readdirSync(byJobDir)) {
    const calPath = join(byJobDir, btJobId, 'calendar.json');
    if (!existsSync(calPath)) continue;
    let cal: { success?: boolean; data?: CalItem[] };
    try { cal = JSON.parse(readFileSync(calPath, 'utf-8')); } catch { continue; }
    if (!cal?.success || !Array.isArray(cal.data)) continue;

    const jobUuid = uuidByBtId.get(btJobId);
    if (!jobUuid) { noJob += cal.data.length; continue; }

    for (const item of cal.data) {
      scanned++;
      const s = parseDate(item.itemStartDate);
      const e = parseDate(item.itemEndDate);
      if (!s || !e) continue;
      const title = item.title || item.name || 'Untitled';
      const hits = byKey.get(key(jobUuid, title, s, e));
      if (!hits || hits.length === 0) { noMatch++; continue; }
      if (hits.length > 1) { ambiguous++; continue; }
      if (hits[0].bt_event_id) { alreadySet++; continue; }
      updates.push({ id: hits[0].id, bt_event_id: String(item.id) });
    }
  }

  // A BT id must not be claimed by two different rows.
  const seen = new Map<string, number>();
  for (const u of updates) seen.set(u.bt_event_id, (seen.get(u.bt_event_id) ?? 0) + 1);
  const collisions = [...seen.entries()].filter(([, n]) => n > 1);

  console.log(`\n  scanned calendar records : ${scanned}`);
  console.log(`  matched -> will backfill : ${updates.length}`);
  console.log(`  job not in BuildOS       : ${noJob}`);
  console.log(`  no matching row          : ${noMatch}`);
  console.log(`  ambiguous (>1 row)       : ${ambiguous}`);
  console.log(`  already keyed            : ${alreadySet}`);
  console.log(`  duplicate BT ids         : ${collisions.length}`);
  if (collisions.length) {
    console.error(`\n  Refusing to write -- the same BT id matched more than one row:`);
    for (const [id, n] of collisions.slice(0, 10)) console.error(`    ${id} x${n}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log(`\n  Dry run. Re-run with --apply to write.\n`);
    return;
  }

  let done = 0;
  for (const u of updates) {
    const { error } = await supabase.from('schedule_items').update({ bt_event_id: u.bt_event_id }).eq('id', u.id);
    if (error) { console.error(`  FAIL ${u.id}: ${error.message}`); continue; }
    done++;
    if (done % 200 === 0) process.stdout.write(`  ${done}/${updates.length}\r`);
  }
  console.log(`\n  backfilled ${done}/${updates.length} rows\n`);
}

main().catch((e) => { console.error('Fatal:', e.message ?? e); process.exit(1); });
