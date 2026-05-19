/**
 * BuilderTrend → Supabase: Seed Job Photos
 *
 * Reads bt-export/by-job/{id}/photos.json + downloaded binaries,
 * uploads to Supabase Storage bucket "job-photos", seeds log_photos table.
 *
 * Photos are stored at: job-photos/{jobUuid}/{photoId}.{ext}
 * log_id is left null (BT photos are job-level, not log-level).
 *
 * Safe to re-run — skips photos whose bt_photo_id is already in the DB.
 *
 * Usage:
 *   npx tsx scripts/bt-seed-photos.ts
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const BUCKET = 'job-photos';

// ─── helpers ──────────────────────────────────────────────────────────────────
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as T; } catch { return null; }
}

type BtPhoto = { id: number; name: string; title: string };

function readPhotosJson(path: string): BtPhoto[] {
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if ((raw?._v === 2 || raw?._v === 3) && Array.isArray(raw.data)) return raw.data as BtPhoto[];
    if (Array.isArray(raw)) return raw as BtPhoto[];
    if (raw?.data && Array.isArray(raw.data)) return raw.data as BtPhoto[];
    return [];
  } catch { return []; }
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.find(b => b.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw new Error(`Create bucket: ${error.message}`);
  console.log(`  Created storage bucket: ${BUCKET}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nJDC Platform — bt-extract photos → Supabase Storage\n');

  // Migration user
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const migUser = list?.users?.find(u => u.email === 'migration@jdc-platform.internal');
  if (!migUser) throw new Error('Migration user not found — run bt-seed.ts first');
  const createdBy = migUser.id;

  // Ensure storage bucket
  console.log('[1] Ensuring storage bucket...');
  await ensureBucket();

  // Load job list + UUID map
  const jobs = readJson<Array<{ jobId: number; jobName: string }>>(join(OUTPUT_DIR, 'jobs.json'));
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found');

  const { data: jobRows } = await supabase.from('jobs').select('id, job_number').limit(1000);
  const btIdToUuid = new Map<number, string>();
  for (const r of jobRows ?? []) btIdToUuid.set(parseInt(r.job_number), r.id);

  // Find already-seeded bt_photo_ids
  const { data: existing } = await supabase.from('log_photos').select('bt_photo_id').limit(100000);
  const seededIds = new Set((existing ?? []).map((r: { bt_photo_id: string }) => r.bt_photo_id));

  console.log(`[2] Processing ${jobs.length} jobs...`);
  let totalUploaded = 0;
  let totalSkipped = 0;

  for (const { jobId, jobName } of jobs) {
    const jobUuid = btIdToUuid.get(jobId);
    if (!jobUuid) continue;

    const photosPath = join(OUTPUT_DIR, 'by-job', String(jobId), 'photos.json');
    const photos = readPhotosJson(photosPath);
    if (!photos.length) continue;

    const toInsert: object[] = [];

    for (const photo of photos) {
      const btPhotoId = String(photo.id);
      if (seededIds.has(btPhotoId)) { totalSkipped++; continue; }

      const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const localPath = join(OUTPUT_DIR, 'by-job', String(jobId), 'photos', `${photo.id}.${ext}`);
      const storagePath = `${jobUuid}/${photo.id}.${ext}`;

      let uploadedPath: string | null = null;

      if (existsSync(localPath)) {
        const fileBuffer = readFileSync(localPath);
        const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        // Check if already in storage
        const { data: existing } = await supabase.storage.from(BUCKET).list(jobUuid, { search: `${photo.id}.${ext}` });
        if (!existing?.length) {
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });
          if (upErr) {
            process.stdout.write(`  ⚠ Upload failed for ${photo.name}: ${upErr.message}\n`);
            continue;
          }
        }
        uploadedPath = storagePath;
      }

      toInsert.push({
        job_id: jobUuid,
        log_id: null,
        bt_photo_id: btPhotoId,
        file_name: photo.name,
        storage_path: uploadedPath,
        bt_url: null, // BT URLs contain session tokens, don't persist them
        uploaded_by: createdBy,
        created_at: new Date().toISOString(),
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('log_photos').insert(toInsert);
      if (error) {
        console.error(`  ✗ DB insert for job ${jobName}: ${error.message}`);
        continue;
      }
      totalUploaded += toInsert.length;
      process.stdout.write(`  ${jobName}: ${toInsert.length} photos uploaded\n`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log('✓ Done');
  console.log(`  Uploaded : ${totalUploaded}`);
  console.log(`  Skipped  : ${totalSkipped} (already in DB)`);
  console.log('─────────────────────────────────────────\n');
}

main().catch(e => { console.error('Fatal:', e.message ?? e); process.exit(1); });
