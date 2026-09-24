/**
 * BuilderTrend — discover the estimate / budget endpoints.
 *
 * No importer has ever pulled estimates or budgets, so the endpoints are not in
 * the runbook inventory. This opens the saved session, finds the nav links for
 * estimate/budget/proposal pages, visits each for one job, and dumps every XHR
 * the page makes (URL, method, request body, response sample) to
 * bt-export/diagnostics/estimate-endpoints.json.
 *
 * Usage:
 *   npx tsx scripts/bt-find-estimate-endpoint.ts [btJobId]
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUT_DIR = join(process.cwd(), 'bt-export', 'diagnostics');
const JOB_ID = process.argv[2] ?? '45973523';
const INTERESTING = /estimat|budget|proposal|costitem|cost-item|jobcost|lineitem|line-item|worksheet/i;

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  const captured: Array<Record<string, unknown>> = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (!['xhr', 'fetch'].includes(req.resourceType())) return;
    let sample = '';
    try { sample = (await res.text()).slice(0, 3000); } catch { /* body unavailable */ }
    captured.push({
      page: page.url(),
      method: req.method(),
      url: req.url(),
      status: res.status(),
      requestBody: req.postData()?.slice(0, 3000) ?? null,
      interesting: INTERESTING.test(req.url()),
      sample,
    });
  });

  await page.goto(`${BT_URL}/app/Landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if (!page.url().includes('/app/')) {
    console.log('Not logged in. Log in to BuilderTrend in the browser window (waiting up to 10 min)...');
    await page.waitForURL('**/app/**', { timeout: 10 * 60_000 });
    await page.waitForTimeout(3000);
  }
  console.log('Logged in.');

  const links = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('a[href]')]
      .map((a) => ({ text: (a.textContent ?? '').trim(), href: (a as HTMLAnchorElement).href }))
      .filter((l) => re.test(l.href) || re.test(l.text));
  }, INTERESTING.source);
  console.log('Nav links:', JSON.stringify(links, null, 1));

  const candidates = new Set<string>(links.map((l) => l.href));
  for (const path of ['/app/Estimate', '/app/Estimates', '/app/Budget', '/app/JobCostingBudget', '/app/Proposals']) {
    candidates.add(`${BT_URL}${path}`);
  }

  for (const base of candidates) {
    const url = base.includes('jobId=') ? base : `${base}${base.includes('?') ? '&' : '?'}jobId=${JOB_ID}`;
    console.log('Visiting', url);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch { /* keep whatever loaded */ }
    await page.waitForTimeout(4000);
    console.log('  landed on', page.url(), '|', await page.title());
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'estimate-endpoints.json');
  writeFileSync(out, JSON.stringify({ links, captured }, null, 2));
  console.log(`\n${captured.length} XHRs captured, ${captured.filter((c) => c.interesting).length} interesting -> ${out}`);
  for (const c of captured.filter((c) => c.interesting)) console.log(`  ${c.status} ${c.method} ${c.url}`);
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
