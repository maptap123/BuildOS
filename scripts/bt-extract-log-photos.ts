/**
 * Buildertrend -> Local: Extract photos attached to daily logs.
 *
 * Reads bt-export/by-job/{jobId}/logs.json, fetches /api/Photos with each
 * Buildertrend daily-log id that has photos, and downloads the binaries.
 *
 * Output:
 *   bt-export/by-job/{jobId}/log-photos.json
 *   bt-export/by-job/{jobId}/log-photos/{logId}/{photoId}.jpg
 *
 * Usage:
 *   npx tsx scripts/bt-extract-log-photos.ts
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const PAGE_SIZE = 5000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type BtLog = {
  id: number;
  hasPhotos?: boolean;
};

type LogsResponse = {
  success?: boolean;
  data?: { dailyLogs?: BtLog[] } | null;
};

type BtPhoto = {
  id: number;
  title?: string | null;
  name: string;
  url: string;
};

type LogPhotoExport = {
  bt_log_id: string;
  photos: BtPhoto[];
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readExisting(path: string): { entries: LogPhotoExport[]; complete: boolean } {
  const raw = readJson<{ _v?: number; data?: LogPhotoExport[] } | LogPhotoExport[]>(path);
  if (Array.isArray(raw)) return { entries: raw, complete: false };
  if (raw?._v === 1 && Array.isArray(raw.data)) return { entries: raw.data, complete: true };
  if (Array.isArray(raw?.data)) return { entries: raw.data, complete: false };
  return { entries: [], complete: false };
}

async function setSession(page: Page, jobId: number) {
  try {
    await page.goto(`${BT_URL}/app/builder/DailyLogs?jobId=${jobId}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    // Buildertrend can leave this navigation hanging after the session is set.
  }
  await sleep(500);
}

async function fetchLogPhotos(page: Page, jobId: number, logId: number): Promise<BtPhoto[]> {
  return page.evaluate(async ([jid, lid, pageSize]) => {
    const response = await fetch(`/api/Photos?jobId=${jid}&logId=${lid}&pageSize=${pageSize}`, {
      headers: { portaltype: '1' },
    });
    const json = await response.json();
    return json?.data ?? [];
  }, [jobId, logId, PAGE_SIZE] as [number, number, number]);
}

async function downloadPhoto(page: Page, photo: BtPhoto, destPath: string): Promise<boolean> {
  try {
    const bytes = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, photo.url);
    if (!bytes) return false;
    writeFileSync(destPath, Buffer.from(bytes));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const jobsPath = join(OUTPUT_DIR, 'jobs.json');
  const jobs = readJson<Array<{ jobId: number; jobName: string }>>(jobsPath);
  if (!jobs?.length) throw new Error('bt-export/jobs.json not found');

  console.log('Launching Buildertrend browser session...');
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  await page.goto(BT_URL);
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('/app/')) {
    console.log('Not logged in. Log in to Buildertrend, then press Enter here.');
    await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));
  }

  let logsChecked = 0;
  let logsWithPhotos = 0;
  let totalPhotos = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { jobId, jobName } = jobs[i];
    const jobDir = join(OUTPUT_DIR, 'by-job', String(jobId));
    const logsResponse = readJson<LogsResponse>(join(jobDir, 'logs.json'));
    const logs = logsResponse?.success ? logsResponse.data?.dailyLogs ?? [] : [];
    const photoLogs = logs.filter(log => log.hasPhotos);
    if (!photoLogs.length) continue;

    const exportPath = join(jobDir, 'log-photos.json');
    const { complete } = readExisting(exportPath);
    if (complete) {
      process.stdout.write(`[${i + 1}/${jobs.length}] ${jobName} - skipped, log photos already extracted\n`);
      continue;
    }

    await setSession(page, jobId);
    const entries: LogPhotoExport[] = [];

    for (const log of photoLogs) {
      logsChecked++;
      const photos = await fetchLogPhotos(page, jobId, log.id);
      entries.push({ bt_log_id: String(log.id), photos });

      if (photos.length > 0) {
        logsWithPhotos++;
        totalPhotos += photos.length;
      }

      const logPhotoDir = join(jobDir, 'log-photos', String(log.id));
      mkdirSync(logPhotoDir, { recursive: true });
      for (const photo of photos) {
        const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const destPath = join(logPhotoDir, `${photo.id}.${ext}`);
        if (!existsSync(destPath)) await downloadPhoto(page, photo, destPath);
        await sleep(100);
      }
    }

    writeFileSync(exportPath, JSON.stringify({ _v: 1, data: entries }, null, 2));
    process.stdout.write(`[${i + 1}/${jobs.length}] ${jobName} - ${entries.length} photo logs, ${entries.reduce((sum, e) => sum + e.photos.length, 0)} photos\n`);
    await sleep(200);
  }

  console.log('\nDone');
  console.log(`  Logs checked    : ${logsChecked}`);
  console.log(`  Logs with photos: ${logsWithPhotos}`);
  console.log(`  Photos found    : ${totalPhotos}`);
  console.log('\nNext: run npx tsx scripts/bt-seed-log-photos.ts');

  await browser.close();
}

main().catch(error => {
  console.error('Fatal:', error.message ?? error);
  process.exit(1);
});
