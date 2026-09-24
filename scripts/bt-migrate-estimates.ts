/**
 * BuilderTrend — extract estimate worksheets and job costing budgets.
 *
 * Neither was ever pulled by bt-migrate.ts. Endpoints found by
 * bt-find-estimate-endpoint.ts on 2026-09-24:
 *   GET  /api/Proposals/{jobId}/Worksheet   estimate worksheet (groups + line items)
 *   POST /apix/v2/JobCostingBudget          job costing budget ({ jobId, filter })
 *
 * Writes bt-export/by-job/{jobId}/estimate.json and budget.json.
 *
 * Usage:
 *   npx tsx scripts/bt-migrate-estimates.ts
 *   npx tsx scripts/bt-migrate-estimates.ts --limit 5
 *   npx tsx scripts/bt-migrate-estimates.ts --job-id 44679465   # re-pull one job
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');

// The filter the budget page itself sends: every cost type, category and status.
const BUDGET_FILTER = JSON.stringify({ '5': '', '6': '', '9': '0,1,2,3,4,5,6,7,8,9', '10': '-1,1,2,3,4,7', '11': '1,4,3,0' });

const limitIdx = process.argv.indexOf('--limit');
const JOB_LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;
const jobIdx = process.argv.indexOf('--job-id');
const ONLY_JOB = jobIdx >= 0 ? Number(process.argv[jobIdx + 1]) : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function btFetch(page: Page, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  return page.evaluate(
    async ([m, url, payload]: [string, string, unknown]) => {
      const r = await fetch(url, {
        method: m,
        headers: { 'content-type': 'application/json', portaltype: '1' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      if (!r.ok) return { _error: r.status };
      return r.json();
    },
    [method, path, body] as [string, string, unknown],
  );
}

// Worksheet groups nest ("Job" → "1 Plans & Permits" → lines); count lines at every level.
type WsGroup = { lineItems?: unknown[]; subGroups?: WsGroup[] };
const countLines = (groups: WsGroup[]): number =>
  groups.reduce((n, g) => n + (g.lineItems?.length ?? 0) + countLines(g.subGroups ?? []), 0);

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
}

async function main() {
  const jobs = JSON.parse(readFileSync(join(OUTPUT_DIR, 'jobs.json'), 'utf-8')) as Array<{ jobId: number; jobName: string }>;
  const todo = ONLY_JOB ? jobs.filter((j) => j.jobId === ONLY_JOB) : JOB_LIMIT ? jobs.slice(0, JOB_LIMIT) : jobs;

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  await page.goto(`${BT_URL}/app/Landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (!page.url().includes('/app/')) {
    console.log('Not logged in. Log in to BuilderTrend in the browser window (waiting up to 10 min)...');
    await page.waitForURL('**/app/**', { timeout: 10 * 60_000 });
    await page.waitForTimeout(2000);
  }

  let withLines = 0, withBudget = 0, errors = 0, lineTotal = 0;
  for (let i = 0; i < todo.length; i++) {
    const { jobId, jobName } = todo[i];
    const dir = join(OUTPUT_DIR, 'by-job', String(jobId));

    const estimate = await btFetch(page, 'GET', `/api/Proposals/${jobId}/Worksheet`) as {
      _error?: number; data?: { formatData?: WsGroup[] };
    };
    const budget = await btFetch(page, 'POST', '/apix/v2/JobCostingBudget', { filter: BUDGET_FILTER, jobId }) as {
      _error?: number; costCategories?: unknown[];
    };
    save(dir, 'estimate.json', estimate);
    save(dir, 'budget.json', budget);

    const lines = countLines(estimate.data?.formatData ?? []);
    const cats = budget.costCategories?.length ?? 0;
    if (estimate._error || budget._error) errors++;
    if (lines) withLines++;
    if (cats) withBudget++;
    lineTotal += lines;
    console.log(`[${i + 1}/${todo.length}] ${jobName} (${jobId}): ${estimate._error ? `estimate ERR ${estimate._error}` : `${lines} lines`}, ${budget._error ? `budget ERR ${budget._error}` : `${cats} budget categories`}`);
    await sleep(150);
  }

  await browser.close();
  console.log(`\nJobs: ${todo.length} | with estimate lines: ${withLines} (${lineTotal} lines) | with budget: ${withBudget} | errors: ${errors}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
