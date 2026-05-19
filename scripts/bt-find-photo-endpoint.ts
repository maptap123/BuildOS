/**
 * Phase 5: Test Photos endpoint with logId from Bryant Bathroom (current logs).
 * Log 87931545 = May 6 2026, hasPhotos:true.
 * Also check if the Photo object has any log-association fields.
 */

import { chromium } from 'playwright';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const JOB_ID  = 43587803;
const LOG_ID1 = 87931545; // May 6 2026, hasPhotos:true
const LOG_ID2 = 86789649; // Apr 7 2026, hasPhotos:true

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  // Set session
  try {
    await page.goto(`${BT_URL}/app/builder/DailyLogs?jobId=${JOB_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch { /* ok */ }
  await new Promise(r => setTimeout(r, 2000));

  // Test Photos endpoint with logId for current logs
  console.log('=== Photos with logId (Bryant Bathroom current logs) ===');
  const tests = [
    `/api/Photos?jobId=${JOB_ID}&logId=${LOG_ID1}`,
    `/api/Photos?jobId=${JOB_ID}&logId=${LOG_ID2}`,
    `/api/Photos?jobId=${JOB_ID}&logId=${LOG_ID1}&pageSize=50`,
  ];
  for (const path of tests) {
    const r = await page.evaluate(async (url) => {
      const res = await fetch(url, { headers: { portaltype: '1' } });
      return res.json();
    }, path) as { data?: unknown };
    console.log(`\n${path}`);
    console.log(JSON.stringify(r?.data ?? r, null, 2).slice(0, 600));
  }

  // Get ALL photos for this job (no logId filter) and show full structure
  console.log('\n=== Full Photos response for job (all fields) ===');
  const all = await page.evaluate(async (jobId) => {
    const r = await fetch(`/api/Photos?jobId=${jobId}&pageSize=100`, { headers: { portaltype: '1' } });
    return r.json();
  }, JOB_ID) as { data?: unknown[] };
  console.log(JSON.stringify(all?.data ?? [], null, 2).slice(0, 2000));

  // Try the Attachments endpoint for a log
  console.log('\n=== Attachments endpoint tests ===');
  const attTests = [
    `/api/Attachments?logId=${LOG_ID1}`,
    `/api/Attachments?logId=${LOG_ID1}&jobId=${JOB_ID}`,
    `/api/Attachments/DailyLog?logId=${LOG_ID1}`,
    `/api/Files?logId=${LOG_ID1}&jobId=${JOB_ID}`,
    `/api/DailyLogAttachments?logId=${LOG_ID1}`,
    `/api/Logs/${LOG_ID1}/files`,
    `/api/Logs/Attachments?logId=${LOG_ID1}`,
  ];
  for (const path of attTests) {
    const r = await page.evaluate(async (url) => {
      const res = await fetch(url, { headers: { portaltype: '1' } });
      const t = await res.text();
      return { status: res.status, body: t.slice(0, 250) };
    }, path);
    console.log(`  ${r.status} ${path}\n    ${r.body}`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
