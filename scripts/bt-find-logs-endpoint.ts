/**
 * Buildertrend diagnostic: find the real Daily Logs pagination request.
 *
 * Opens a known job's Daily Logs page and records requests/responses containing
 * "Log" so we can mirror the same endpoint instead of relying on the capped
 * /api/Logs default response.
 *
 * Usage:
 *   npx.cmd tsx scripts/bt-find-logs-endpoint.ts 43587803
 */

import { chromium, type Response } from 'playwright';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const jobId = Number(process.argv[2] ?? 43587803);

async function summarizeResponse(response: Response) {
  const request = response.request();
  const url = response.url();
  if (!url.includes('/api/') || !/log/i.test(url)) return;

  let summary = '';
  try {
    const json = await response.json();
    const dailyLogs = json?.data?.dailyLogs;
    const data = json?.data?.data;
    const items = Array.isArray(dailyLogs) ? dailyLogs : Array.isArray(data) ? data : null;
    summary = items ? ` rows=${items.length}` : ` keys=${Object.keys(json ?? {}).join(',')}`;
  } catch {
    summary = ' non-json';
  }

  console.log(`\n${request.method()} ${url.replace(BT_URL, '')}`);
  const postData = request.postData();
  if (postData) console.log(`body: ${postData.slice(0, 1200)}`);
  console.log(`status=${response.status()}${summary}`);
}

async function main() {
  console.log(`Opening Daily Logs for job ${jobId}...`);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();

  page.on('response', response => {
    summarizeResponse(response).catch(error => console.log(`response inspect failed: ${error.message}`));
  });

  await page.goto(`${BT_URL}/app/builder/DailyLogs?jobId=${jobId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('Waiting 20 seconds. Scroll or click any Daily Logs pagination/load-more controls if you see them.');
  await page.waitForTimeout(20000);
  await browser.close();
  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal:', error.message ?? error);
  process.exit(1);
});
