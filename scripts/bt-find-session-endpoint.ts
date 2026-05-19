/**
 * Intercepts BT network requests to find the contacts API call.
 * Navigates to the contacts page for a known job and logs every POST to /api/.
 */

import { chromium } from 'playwright';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const TEST_JOB_ID = 32249197; // Adams Flooring

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  const apiCalls: Array<{ method: string; url: string; body: string }> = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/') && !url.includes('sentry.io')) {
      apiCalls.push({
        method: req.method(),
        url: url.replace(BT_URL, ''),
        body: req.postData() ?? '',
      });
    }
  });

  // Start at BT home
  await page.goto(BT_URL);
  await page.waitForLoadState('networkidle');
  console.log('At BT home. URL:', page.url());

  // Step 1 — set session by navigating to DailyLogs (known to work)
  apiCalls.length = 0;
  console.log('\n--- Setting session via DailyLogs page ---');
  try {
    await page.goto(`${BT_URL}/app/builder/DailyLogs?jobId=${TEST_JOB_ID}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
  } catch { /* timeout ok */ }
  await new Promise(r => setTimeout(r, 1500));

  // Verify session is set
  const logsCheck = await page.evaluate(async (jobId) => {
    const r = await fetch(`/api/Logs?jobId=${jobId}`, { headers: { portaltype: '1' } });
    return r.json();
  }, TEST_JOB_ID) as { success?: boolean; message?: string };
  console.log('Session check (logs):', logsCheck.success, logsCheck.message ?? '');

  // Step 2 — navigate to Contacts page for the same job
  apiCalls.length = 0;
  console.log('\n--- Navigating to Contacts page ---');
  try {
    await page.goto(`${BT_URL}/app/builder/Contacts?jobId=${TEST_JOB_ID}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
  } catch { /* timeout ok */ }
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nAPI calls during Contacts page load:');
  apiCalls.forEach(c => {
    console.log(`  ${c.method} ${c.url}`);
    if (c.body) console.log(`    body: ${c.body.slice(0, 300)}`);
  });

  // Step 3 — also try manual fetch variations to find the right one
  console.log('\n--- Testing contacts endpoint variations ---');

  const variations: Array<{ label: string; path: string; body: unknown }> = [
    { label: 'GET firstRow+lastRow', path: `/api/Contacts?jobId=${TEST_JOB_ID}&firstRow=1&lastRow=100&pageSize=100&pageNumber=1`, body: null },
    { label: 'GET firstRow only', path: `/api/Contacts?jobId=${TEST_JOB_ID}&firstRow=1`, body: null },
    { label: 'GET firstRow+pageSize', path: `/api/Contacts?jobId=${TEST_JOB_ID}&firstRow=1&pageSize=100`, body: null },
    { label: 'POST /api/Contacts/Grid small page', path: '/api/Contacts/Grid', body: { gridRequest: { savedViewId: -1, sortColumn: '3', sortDirection: 'desc', hasFooter: false, emptyStateEntity: 4, selectedColumns: [] }, pagingData: { pageNumber: '1', pageSize: 50, resetScroll: false, firstRow: 1, lastRow: 50, totalRowsAllPages: 50, currentPage: 1 }, filters: {}, jobIds: [TEST_JOB_ID] } },
  ];

  for (const v of variations) {
    const result = await page.evaluate(async ([path, body]) => {
      try {
        const opts: RequestInit = { headers: { 'content-type': 'application/json', portaltype: '1' } };
        if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
        const r = await fetch(path as string, opts);
        const text = await r.text();
        return { status: r.status, body: text.slice(0, 400) };
      } catch (e: unknown) {
        return { status: -1, body: e instanceof Error ? e.message : String(e) };
      }
    }, [v.path, v.body] as [string, unknown]);
    console.log(`  ${v.label}: ${result.status} — ${result.body.slice(0, 200)}`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
