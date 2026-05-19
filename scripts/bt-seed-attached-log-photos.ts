/**
 * Buildertrend -> Supabase: seed photos attached inside Daily Logs grid export.
 *
 * Reads bt-export/by-job/{jobId}/logs.json, downloads attached daily-log photos
 * through the authenticated Buildertrend browser session, uploads them to the
 * Supabase Storage bucket "job-photos", and links rows to daily_logs.
 *
 * Usage:
 *   npx.cmd tsx scripts/bt-seed-attached-log-photos.ts --job-id 30914203
 *   npx.cmd tsx scripts/bt-seed-attached-log-photos.ts --limit 5
 */

import { chromium, type Page } from 'playwright';
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

loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const BUCKET = 'job-photos';
const jobIdArg = argValue('--job-id');
const limitArg = argValue('--limit');

type BtJob = { jobId: number; jobName: string };

type BtFile = {
  id: number;
  title?: string | null;
  extension?: string | null;
  rowVersion?: string | null;
  isPhoto?: boolean;
  downloadDocPath?: string | null;
  docPath?: string | null;
  thumbnail?: string | null;
};

type BtLog = {
  id: number;
  files?: BtFile[] | null;
};

type LogsResponse = {
  success?: boolean;
  data?: { dailyLogs?: BtLog[] } | null;
};

type ExistingPhotoRow = {
  id: string;
  bt_photo_id: string | null;
  storage_path: string | null;
};

type AppJobRow = { id: string; job_number: string | number | null };
type AppLogRow = { id: string; bt_log_id: string | number | null };
type SupabaseError = { message: string };
type QueryResult<T> = { data: T[] | null; error: SupabaseError | null };

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function mimeTypeFor(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

async function withTimeout<T>(label: string, promise: PromiseLike<T>, timeoutMs = 60_000): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchAllRows<T>(
  label: string,
  queryPage: (from: number, to: number) => PromiseLike<QueryResult<T>>,
) {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await withTimeout(`${label} rows ${from + 1}-${to + 1}`, queryPage(from, to));
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureBucket() {
  const { data: buckets } = await withTimeout('Supabase bucket list', supabase.storage.listBuckets());
  if (buckets?.some(bucket => bucket.name === BUCKET)) return;
  const { error } = await withTimeout(
    'Supabase bucket create',
    supabase.storage.createBucket(BUCKET, { public: true }),
  );
  if (error) throw new Error(`Create bucket: ${error.message}`);
}

async function downloadFile(page: Page, file: BtFile) {
  const urls = [file.downloadDocPath, file.docPath, file.thumbnail].filter(
    (url): url is string => Boolean(url),
  );
  for (const url of urls) {
    const bytes = await page.evaluate(async fileUrl => {
      const response = await fetch(fileUrl, { credentials: 'include' });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, url);
    if (bytes?.length) return bytes;
  }
  return null;
}

async function uploadPhoto(storagePath: string, bytes: number[], contentType: string, fileId: number) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(bytes), { contentType, upsert: false });
    if (!error) return { uploaded: true };
    if (error.message.includes('already exists')) return { uploaded: false };
    if (attempt === 3) throw new Error(`Upload ${fileId}: ${error.message}`);
    console.log(`  retrying upload ${fileId} after ${error.message}`);
    await wait(1500 * attempt);
  }
  return { uploaded: false };
}

async function main() {
  console.log('Starting attached daily-log photo seed...');
  console.log('[1/7] Checking Supabase photo storage...');
  await ensureBucket();
  console.log('  storage ready');

  console.log('[2/7] Reading Buildertrend export files...');
  const loadedJobs = readJson<BtJob[]>(join(OUTPUT_DIR, 'jobs.json'));
  const jobs = (jobIdArg
    ? loadedJobs?.filter(job => String(job.jobId) === jobIdArg)
    : limitArg
      ? loadedJobs?.slice(0, Number(limitArg))
      : loadedJobs) ?? null;
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found or no jobs selected');
  console.log(`  selected ${jobs.length} job(s)`);

  console.log('[3/7] Matching jobs in the app...');
  const jobRows = await fetchAllRows<AppJobRow>(
    'Supabase jobs lookup',
    (from, to) => supabase.from('jobs').select('id, job_number').range(from, to),
  );
  const appJobByBtId = new Map(jobRows.map(row => [Number(row.job_number), row.id]));

  console.log('[4/7] Matching daily logs in the app...');
  const logRows = await fetchAllRows<AppLogRow>(
    'Supabase daily log lookup',
    (from, to) =>
      supabase
        .from('daily_logs')
        .select('id, bt_log_id')
        .not('bt_log_id', 'is', null)
        .range(from, to),
  );
  const appLogByBtId = new Map(logRows.map(row => [String(row.bt_log_id), row.id]));

  console.log('[5/7] Checking for photos already uploaded...');
  const existingRows = await fetchAllRows<ExistingPhotoRow>(
    'Supabase existing photo lookup',
    (from, to) =>
      supabase
        .from('log_photos')
        .select('id, bt_photo_id, storage_path')
        .not('bt_photo_id', 'is', null)
        .range(from, to),
  );
  const existingByBtPhotoId = new Map<string, ExistingPhotoRow>();
  for (const row of existingRows) {
    if (row.bt_photo_id) existingByBtPhotoId.set(row.bt_photo_id, row);
  }

  console.log('[6/7] Finding the migration user...');
  const { data: list } = await withTimeout('Supabase user lookup', supabase.auth.admin.listUsers({ perPage: 1000 }));
  const migrationUser = list?.users?.find(user => user.email === 'migration@jdc-platform.internal');
  if (!migrationUser) throw new Error('Migration user not found. Run bt-seed.ts first.');

  console.log(`[7/7] Launching Buildertrend browser for ${jobs.length} job(s)...`);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  console.log('  opening Buildertrend...');
  await page.goto(`${BT_URL}/app/Landing`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!page.url().includes('/app/')) {
    console.log('Log in to Buildertrend in the opened browser. This script will continue automatically.');
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline && !page.url().includes('/app/')) {
      await page.waitForTimeout(1000);
    }
    if (!page.url().includes('/app/')) {
      throw new Error(`Buildertrend login was not detected. Current URL: ${page.url()}`);
    }
  }
  console.log(`Buildertrend session ready: ${page.url()}`);

  let inserted = 0;
  let updated = 0;
  let uploaded = 0;
  let skipped = 0;

  console.log('Uploading attached photos...');
  for (const [jobIndex, job] of jobs.entries()) {
    const appJobId = appJobByBtId.get(job.jobId);
    let jobSeen = 0;
    let jobUploaded = 0;
    let jobInserted = 0;
    let jobUpdated = 0;
    let jobSkipped = 0;
    if (!appJobId) {
      skipped++;
      jobSkipped++;
      console.log(`[${jobIndex + 1}/${jobs.length}] ${job.jobName}: skipped, job not found in app`);
      continue;
    }

    const logsResponse = readJson<LogsResponse>(join(OUTPUT_DIR, 'by-job', String(job.jobId), 'logs.json'));
    const logs = logsResponse?.success ? logsResponse.data?.dailyLogs ?? [] : [];
    for (const log of logs) {
      const appLogId = appLogByBtId.get(String(log.id));
      if (!appLogId) {
        skipped += log.files?.length ?? 0;
        jobSkipped += log.files?.length ?? 0;
        continue;
      }

      for (const file of log.files ?? []) {
        if (!file.isPhoto) continue;
        jobSeen++;
        const btPhotoId = String(file.id);
        const ext = (file.extension ?? file.title?.split('.').pop() ?? 'jpg').toLowerCase();
        const storagePath = `${appJobId}/${log.id}/${file.id}.${ext}`;
        const existing = existingByBtPhotoId.get(btPhotoId);
        let uploadedPath = existing?.storage_path ?? storagePath;

        if (!existing?.storage_path) {
          const bytes = await downloadFile(page, file);
          if (!bytes) {
            console.log(`  skipped download ${job.jobName} ${file.title ?? file.id}`);
            skipped++;
            jobSkipped++;
            continue;
          }
          const uploadResult = await uploadPhoto(storagePath, bytes, mimeTypeFor(ext), file.id);
          uploadedPath = storagePath;
          if (uploadResult.uploaded) {
            uploaded++;
            jobUploaded++;
          }
        }

        if (existing) {
          const { error } = await supabase
            .from('log_photos')
            .update({ job_id: appJobId, log_id: appLogId, bt_log_id: String(log.id), storage_path: uploadedPath })
            .eq('id', existing.id);
          if (error) throw new Error(`Update photo ${file.id}: ${error.message}`);
          updated++;
          jobUpdated++;
        } else {
          const { data: row, error } = await supabase
            .from('log_photos')
            .upsert({
              job_id: appJobId,
              log_id: appLogId,
              bt_photo_id: btPhotoId,
              bt_log_id: String(log.id),
              file_name: file.title ?? `${file.id}.${ext}`,
              storage_path: uploadedPath,
              uploaded_by: migrationUser.id,
            }, { onConflict: 'bt_photo_id' })
            .select('id, bt_photo_id, storage_path')
            .single();
          if (error) throw new Error(`Insert photo ${file.id}: ${error.message}`);
          inserted++;
          jobInserted++;
          if (row?.bt_photo_id) existingByBtPhotoId.set(row.bt_photo_id, row as ExistingPhotoRow);
        }
      }
    }
    if (jobSeen || jobSkipped) {
      console.log(
        `[${jobIndex + 1}/${jobs.length}] ${job.jobName}: ${jobUploaded} uploaded, ${jobInserted} inserted, ${jobUpdated} updated, ${jobSkipped} skipped (${jobSeen} photo refs)`,
      );
    } else {
      console.log(`[${jobIndex + 1}/${jobs.length}] ${job.jobName}: no attached photos`);
    }
  }

  await browser.close();
  console.log('\nAttached daily-log photos seeded');
  console.log(`  Uploaded : ${uploaded}`);
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Updated  : ${updated}`);
  console.log(`  Skipped  : ${skipped}`);
}

main().catch(error => {
  console.error('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
