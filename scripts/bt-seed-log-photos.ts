/**
 * Buildertrend -> Supabase: Seed and link daily-log photos.
 *
 * Reads bt-export/by-job/{jobId}/log-photos.json and the downloaded binaries,
 * uploads missing files to Supabase Storage, and links rows in log_photos to
 * the matching daily_logs row by bt_log_id.
 *
 * Safe to re-run. If a photo was already inserted by the job-level photo seed,
 * this script updates that row with bt_log_id/log_id instead of duplicating it.
 *
 * Usage:
 *   npx tsx scripts/bt-seed-log-photos.ts
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const BUCKET = 'job-photos';

type BtPhoto = {
  id: number;
  title?: string | null;
  name: string;
  url?: string | null;
};

type LogPhotoExport = {
  bt_log_id: string;
  photos: BtPhoto[];
};

type ExistingPhotoRow = {
  id: string;
  bt_photo_id: string | null;
  storage_path: string | null;
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readLogPhotos(path: string): LogPhotoExport[] {
  const raw = readJson<{ data?: LogPhotoExport[] } | LogPhotoExport[]>(path);
  if (Array.isArray(raw)) return raw;
  return raw?.data ?? [];
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some(bucket => bucket.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw new Error(`Create bucket: ${error.message}`);
}

function mimeTypeFor(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function main() {
  console.log('\nJDC Platform - seed Buildertrend daily-log photos\n');

  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const migrationUser = list?.users?.find(user => user.email === 'migration@jdc-platform.internal');
  if (!migrationUser) throw new Error('Migration user not found. Run bt-seed.ts first.');
  const uploadedBy = migrationUser.id;

  await ensureBucket();

  const jobs = readJson<Array<{ jobId: number; jobName: string }>>(join(OUTPUT_DIR, 'jobs.json'));
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found');

  const { data: jobRows, error: jobError } = await supabase.from('jobs').select('id, job_number').limit(100000);
  if (jobError) throw new Error(`Job lookup: ${jobError.message}`);
  const btJobIdToUuid = new Map<number, string>();
  for (const row of jobRows ?? []) btJobIdToUuid.set(parseInt(row.job_number, 10), row.id);

  const { data: logRows, error: logError } = await supabase
    .from('daily_logs')
    .select('id, bt_log_id')
    .not('bt_log_id', 'is', null)
    .limit(100000);
  if (logError) throw new Error(`Daily log lookup: ${logError.message}`);
  const btLogIdToUuid = new Map<string, string>();
  for (const row of logRows ?? []) {
    if (row.bt_log_id) btLogIdToUuid.set(row.bt_log_id, row.id);
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('log_photos')
    .select('id, bt_photo_id, storage_path')
    .not('bt_photo_id', 'is', null)
    .limit(100000);
  if (existingError) throw new Error(`Existing photo lookup: ${existingError.message}`);
  const existingByBtPhotoId = new Map<string, ExistingPhotoRow>();
  for (const row of (existingRows ?? []) as ExistingPhotoRow[]) {
    if (row.bt_photo_id) existingByBtPhotoId.set(row.bt_photo_id, row);
  }

  let inserted = 0;
  let updated = 0;
  let uploaded = 0;
  let missingLog = 0;

  for (const { jobId, jobName } of jobs) {
    const jobUuid = btJobIdToUuid.get(jobId);
    if (!jobUuid) continue;

    const entries = readLogPhotos(join(OUTPUT_DIR, 'by-job', String(jobId), 'log-photos.json'));
    if (!entries.length) continue;

    for (const entry of entries) {
      const logUuid = btLogIdToUuid.get(entry.bt_log_id);
      if (!logUuid) {
        missingLog += entry.photos.length;
        continue;
      }

      for (const photo of entry.photos) {
        const btPhotoId = String(photo.id);
        const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const localPath = join(OUTPUT_DIR, 'by-job', String(jobId), 'log-photos', entry.bt_log_id, `${photo.id}.${ext}`);
        const storagePath = `${jobUuid}/${entry.bt_log_id}/${photo.id}.${ext}`;
        let uploadedPath: string | null = null;

        if (existsSync(localPath)) {
          const existing = existingByBtPhotoId.get(btPhotoId);
          uploadedPath = existing?.storage_path ?? storagePath;

          if (!existing?.storage_path) {
            const fileBuffer = readFileSync(localPath);
            const { data: alreadyUploaded } = await supabase.storage.from(BUCKET).list(`${jobUuid}/${entry.bt_log_id}`, {
              search: `${photo.id}.${ext}`,
            });
            if (!alreadyUploaded?.length) {
              const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(storagePath, fileBuffer, { contentType: mimeTypeFor(ext), upsert: false });
              if (uploadError) {
                process.stdout.write(`  Upload failed for ${jobName} ${photo.name}: ${uploadError.message}\n`);
                continue;
              }
              uploaded++;
            }
          }
        }

        const existing = existingByBtPhotoId.get(btPhotoId);
        if (existing) {
          const { error } = await supabase
            .from('log_photos')
            .update({
              log_id: logUuid,
              bt_log_id: entry.bt_log_id,
              storage_path: uploadedPath ?? existing.storage_path,
            })
            .eq('id', existing.id);
          if (error) throw new Error(`Update photo ${btPhotoId}: ${error.message}`);
          updated++;
          continue;
        }

        const { data: insertedRow, error } = await supabase
          .from('log_photos')
          .insert({
            job_id: jobUuid,
            log_id: logUuid,
            bt_photo_id: btPhotoId,
            bt_log_id: entry.bt_log_id,
            file_name: photo.name,
            storage_path: uploadedPath,
            bt_url: null,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString(),
          })
          .select('id, bt_photo_id, storage_path')
          .single();
        if (error) throw new Error(`Insert photo ${btPhotoId}: ${error.message}`);
        inserted++;
        if (insertedRow?.bt_photo_id) existingByBtPhotoId.set(insertedRow.bt_photo_id, insertedRow as ExistingPhotoRow);
      }
    }
  }

  console.log('Done');
  console.log(`  Inserted       : ${inserted}`);
  console.log(`  Linked existing: ${updated}`);
  console.log(`  Uploaded files : ${uploaded}`);
  console.log(`  Missing logs   : ${missingLog}`);
}

main().catch(error => {
  console.error('Fatal:', error.message ?? error);
  process.exit(1);
});
