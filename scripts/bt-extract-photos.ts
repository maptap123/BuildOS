/**
 * BuilderTrend → Local: Extract job photos
 *
 * For each job, fetches /api/Photos?jobId={id} and downloads the binaries
 * using the authenticated browser session (BT URLs require session cookies).
 *
 * Output:
 *   bt-export/by-job/{jobId}/photos.json   — photo metadata list
 *   bt-export/by-job/{jobId}/photos/{id}.jpg — binary downloads
 *
 * Usage:
 *   npx tsx scripts/bt-extract-photos.ts
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const PAGE_SIZE = 5000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type BtPhoto = {
  id: number;
  title: string;
  name: string;
  url: string;
};

// Returns photos + whether this file was written by this script (vs old migration).
// Only trust the count as complete when _v===3 (written with pageSize=5000).
function readPhotosJson(path: string): { photos: BtPhoto[]; complete: boolean } {
  if (!existsSync(path)) return { photos: [], complete: false };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (raw?._v === 3 && Array.isArray(raw.data)) return { photos: raw.data as BtPhoto[], complete: true };
    if (Array.isArray(raw)) return { photos: raw as BtPhoto[], complete: false };
    if (raw?.data && Array.isArray(raw.data)) return { photos: raw.data as BtPhoto[], complete: false };
    return { photos: [], complete: false };
  } catch { return { photos: [], complete: false }; }
}

async function setSession(page: Page, jobId: number) {
  try {
    await page.goto(`${BT_URL}/app/builder/DailyLogs?jobId=${jobId}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch { /* timeout ok */ }
  await sleep(500);
}

async function fetchPhotos(page: Page, jobId: number): Promise<BtPhoto[]> {
  return page.evaluate(async ([jid, ps]) => {
    const r = await fetch(`/api/Photos?jobId=${jid}&pageSize=${ps}`, { headers: { portaltype: '1' } });
    const json = await r.json();
    return json?.data ?? [];
  }, [jobId, PAGE_SIZE] as [number, number]);
}

async function downloadPhoto(page: Page, photo: BtPhoto, destPath: string): Promise<boolean> {
  try {
    const buffer = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Array.from(new Uint8Array(ab));
    }, photo.url);
    if (!buffer) return false;
    writeFileSync(destPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const jobsPath = join(OUTPUT_DIR, 'jobs.json');
  if (!existsSync(jobsPath)) { console.error('bt-export/jobs.json not found'); process.exit(1); }
  const allJobs = JSON.parse(readFileSync(jobsPath, 'utf-8')) as Array<{ jobId: number; jobName: string }>;

  console.log(`Launching browser...`);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  await page.goto(BT_URL);
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('/app/')) {
    console.log('Not logged in — please log in then press Enter...');
    await new Promise<void>(r => process.stdin.once('data', () => r()));
  }
  console.log('Logged in.\n');

  let totalPhotos = 0;
  let jobsWithPhotos = 0;
  let currentJobId = 0;

  for (let i = 0; i < allJobs.length; i++) {
    const { jobId, jobName } = allJobs[i];
    const jobDir = join(OUTPUT_DIR, 'by-job', String(jobId));
    const photosJsonPath = join(jobDir, 'photos.json');

    // Skip only if photos.json was written by this script (_v:3 = fetched with pageSize=5000)
    // AND every binary is on disk. Old migration files (_v missing) are never trusted as complete.
    const { photos: existingPhotos, complete } = readPhotosJson(photosJsonPath);
    if (complete) {
      if (existingPhotos.length === 0) {
        process.stdout.write(`[${i + 1}/${allJobs.length}] ${jobName} — skipped (no photos)\n`);
        continue;
      }
      const photosDir = join(jobDir, 'photos');
      const allDownloaded = existingPhotos.every(p => {
        const ext = p.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        return existsSync(join(photosDir, `${p.id}.${ext}`));
      });
      if (allDownloaded) {
        process.stdout.write(`[${i + 1}/${allJobs.length}] ${jobName} — skipped (already done)\n`);
        continue;
      }
    }

    // Set session if job changed
    if (currentJobId !== jobId) {
      await setSession(page, jobId);
      currentJobId = jobId;
    }

    // Always fetch fresh — existing photos.json may be incomplete (original migration had no pageSize)
    const photos = await fetchPhotos(page, jobId);

    // Save metadata with version marker so future runs know this is a complete pageSize=5000 fetch
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(photosJsonPath, JSON.stringify({ _v: 3, data: photos }, null, 2));

    if (photos.length === 0) {
      process.stdout.write(`[${i + 1}/${allJobs.length}] ${jobName} — 0 photos\n`);
      continue;
    }

    // Download each photo
    const photosDir = join(jobDir, 'photos');
    mkdirSync(photosDir, { recursive: true });

    let downloaded = 0;
    for (const photo of photos) {
      const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const destPath = join(photosDir, `${photo.id}.${ext}`);
      if (!existsSync(destPath)) {
        const ok = await downloadPhoto(page, photo, destPath);
        if (ok) downloaded++;
      } else {
        downloaded++;
      }
      await sleep(100);
    }

    process.stdout.write(`[${i + 1}/${allJobs.length}] ${jobName} — ${photos.length} photos (${downloaded} downloaded)\n`);
    totalPhotos += downloaded;
    if (photos.length > 0) jobsWithPhotos++;

    await sleep(200);
  }

  console.log('\n─────────────────────────────────────────');
  console.log('✓ Done');
  console.log(`  Jobs with photos : ${jobsWithPhotos}`);
  console.log(`  Total photos     : ${totalPhotos}`);
  console.log('\nNext: run  npx tsx scripts/bt-seed-photos.ts  to upload to Supabase Storage');
  console.log('─────────────────────────────────────────\n');

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
