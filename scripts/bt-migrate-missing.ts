/**
 * BuilderTrend — Re-extract Logs & Contacts
 *
 * The original bt-migrate.ts failed on logs and contacts because those APIs
 * require the BT session to have a "current job" set. This script fixes that
 * by navigating the browser to each job before fetching session-dependent data.
 *
 * Overwrites bt-export/by-job/{jobId}/logs.json and contacts.json in place.
 *
 * Usage:
 *   npx tsx scripts/bt-migrate-missing.ts
 *   npx tsx scripts/bt-migrate-missing.ts --limit 5
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');
const LOG_PAGE_SIZE = 20;

function argValue(name: string): string | null {
  const exact = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const limitArg = argValue('--limit');
const JOB_LIMIT = limitArg ? Number(limitArg) : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
}

async function btPost(page: Page, path: string, body: unknown): Promise<unknown> {
  return page.evaluate(
    async ([url, payload]: [string, unknown]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', portaltype: '1' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return { _error: r.status };
      return r.json();
    },
    [path, body] as [string, unknown]
  );
}

async function btMergePatch(page: Page, path: string, body: unknown): Promise<unknown> {
  return page.evaluate(
    async ([url, payload]: [string, unknown]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/merge-patch+json', portaltype: '1' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return { _error: r.status, body: await r.text().catch(() => '') };
      return r.json();
    },
    [path, body] as [string, unknown]
  );
}

function gridBody(jobIds: number[], page = 1, pageSize = 200) {
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = page * pageSize;
  return {
    gridRequest: {
      savedViewId: -1,
      sortColumn: '3',
      sortDirection: 'desc',
      hasFooter: false,
      emptyStateEntity: 4,
      selectedColumns: [],
    },
    pagingData: {
      pageNumber: String(page),
      pageSize,
      resetScroll: page === 1,
      firstRow,
      lastRow,
      totalRowsAllPages: lastRow,
      currentPage: page,
    },
    filters: {},
    jobIds,
  };
}

async function fetchAllContacts(page: Page, jobId: number): Promise<unknown> {
  const PAGE_SIZE = 200;
  const allItems: unknown[] = [];
  let pageNum = 1;

  while (true) {
    const result = await btPost(page, '/api/Contacts/Grid', gridBody([jobId], pageNum, PAGE_SIZE)) as {
      _error?: unknown;
      success?: boolean;
      data?: { data?: unknown[] };
    };
    if (!result || result._error || result.success === false) return result;

    const items: unknown[] = result.data?.data ?? [];
    allItems.push(...items);

    if (items.length < PAGE_SIZE) break; // last page
    pageNum++;
  }

  return { success: true, data: { data: allItems } };
}

type GridLog = {
  dailyLogId: number;
  jobsiteId: number;
  addedBy: string | null;
  logDate: string | null;
  logTitle: string | null;
  logNotes: string | null;
  dateCreated?: string | null;
  weatherInformation?: unknown;
  attachedFiles?: { files?: unknown[] } | null;
};

type DailyLogsGridResponse = {
  _error?: unknown;
  data?: GridLog[];
  totalPages?: number;
  records?: number;
  pageSize?: number;
  page?: number;
};

function dailyLogsGridBody(jobId: number, page = 1, pageSize = LOG_PAGE_SIZE) {
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = page * pageSize;
  return {
    jobIds: [jobId],
    filters: {
      '3': '',
      '4': '',
      '8': JSON.stringify({ SelectedValue: 2147483647, StartDate: null, EndDate: null }),
      '10': '',
      '11': 0,
    },
    gridRequest: {
      hideMultiJobsColumns: true,
      emptyStateEntity: 18,
    },
    pagingData: {
      pageNumber: page,
      pageSize,
      resetScroll: page === 1,
      firstRow,
      lastRow,
      totalRowsAllPages: pageSize,
      currentPage: page,
    },
  };
}

function normalizeGridLog(log: GridLog) {
  const files = log.attachedFiles?.files ?? [];
  return {
    id: log.dailyLogId,
    date: log.logDate ? new Date(log.logDate).toLocaleDateString('en-US') : '',
    addedBy: log.addedBy ?? '',
    jobsiteID: String(log.jobsiteId),
    notes: log.logNotes ?? '',
    files,
    tags: '',
    weatherInformation: log.weatherInformation ?? null,
    weatherNotes: null,
    dateCreated: log.dateCreated ?? log.logDate,
    logDate: log.logDate,
    logTitle: log.logTitle ?? null,
    hasAttachments: files.length > 0,
    hasRelatedTodos: false,
    hasComments: false,
    hasPhotos: files.length > 0,
  };
}

async function fetchAllLogs(page: Page, jobId: number): Promise<unknown> {
  const first = await btMergePatch(page, '/apix/v2/DailyLogs/grid', dailyLogsGridBody(jobId)) as DailyLogsGridResponse;
  if (first?._error) return first;

  const logs = [...(first.data ?? [])];

  // Do NOT trust `totalPages`. BT derives it from the `totalRowsAllPages` hint
  // we send in pagingData, which we set to one page's worth -- so it comes back
  // as 2 no matter how many logs the job really has, and every job silently
  // truncated to 40 rows. `records` is the true total; page off that instead,
  // and stop early if a page comes back short.
  const total = first.records ?? logs.length;
  const pageSize = first.pageSize ?? LOG_PAGE_SIZE;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  for (let pageNum = 2; pageNum <= lastPage; pageNum++) {
    const response = await btMergePatch(page, '/apix/v2/DailyLogs/grid', dailyLogsGridBody(jobId, pageNum)) as DailyLogsGridResponse;
    if (response?._error) return response;
    const batch = response.data ?? [];
    logs.push(...batch);
    if (batch.length < pageSize) break;
    if (logs.length >= total) break;
  }

  if (total && logs.length < total) {
    console.warn(`    ! job ${jobId}: got ${logs.length}/${total} logs`);
  }

  return {
    success: true,
    message: '',
    needsToRelogin: false,
    data: {
      dailyLogs: logs.map(normalizeGridLog),
    },
    metadata: {
      source: '/apix/v2/DailyLogs/grid',
      records: first.records ?? logs.length,
      pageSize: first.pageSize,
    },
  };
}

function isError(data: unknown): boolean {
  if (data == null) return true;
  const d = data as Record<string, unknown>;
  if ('_error' in d) return true;
  if (d.success === false) return true;
  return false;
}

async function main() {
  // Load jobs list
  const jobsPath = join(OUTPUT_DIR, 'jobs.json');
  if (!existsSync(jobsPath)) {
    console.error('bt-export/jobs.json not found — run bt-migrate.ts first');
    process.exit(1);
  }
  const loadedJobs = JSON.parse(readFileSync(jobsPath, 'utf-8')) as Array<{
    jobId: number;
    jobName: string;
  }>;
  const allJobs = JOB_LIMIT && Number.isFinite(JOB_LIMIT) && JOB_LIMIT > 0
    ? loadedJobs.slice(0, JOB_LIMIT)
    : loadedJobs;

  console.log(`Launching browser (reusing saved session)...`);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // Verify login
  await page.goto(BT_URL);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
  if (!page.url().includes('/app/')) {
    // Poll for the login rather than blocking on stdin -- see bt-migrate.ts.
    console.log('\nNot logged in. Please log in to BuilderTrend in the browser window.');
    console.log('Waiting up to 10 minutes for you to finish; no keypress needed.');
    try {
      await page.waitForURL('**/app/**', { timeout: 10 * 60_000 });
    } catch {
      console.error('\nTimed out waiting for login. Re-run once you are signed in.');
      await browser.close();
      process.exit(1);
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
  }
  console.log(`Logged in.${JOB_LIMIT ? ` Test limit: ${allJobs.length}/${loadedJobs.length} jobs.` : ''}\n`);

  let success = 0;
  let errors = 0;

  for (let i = 0; i < allJobs.length; i++) {
    const { jobId, jobName } = allJobs[i];
    const jobDir = join(OUTPUT_DIR, 'by-job', String(jobId));

    process.stdout.write(`[${i + 1}/${allJobs.length}] ${jobName} (${jobId})... `);

    // Keep the browser on a valid Buildertrend app page. Daily logs are loaded
    // through the v2 grid API below; the old /app/builder/DailyLogs?jobId=...
    // route now returns a 404 and should not be used to set context.
    if (!page.url().includes('/app/')) {
      await page.goto(`${BT_URL}/app/Landing`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    // Fetch logs. Buildertrend defaults this endpoint to a tiny page.
    const logs = await fetchAllLogs(page, jobId);
    save(jobDir, 'logs.json', logs);

    // Fetch contacts via grid endpoint (paginated to avoid SQL timeout)
    const contacts = await fetchAllContacts(page, jobId);
    save(jobDir, 'contacts.json', contacts);

    const logsOk = !isError(logs);
    const contactsOk = !isError(contacts);

    if (logsOk && contactsOk) {
      console.log('✓');
      success++;
    } else {
      const failed = [!logsOk && 'logs', !contactsOk && 'contacts'].filter(Boolean).join(', ');
      console.log(`⚠ ${failed} failed`);
      errors++;
    }

    await sleep(200);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✓ Done`);
  console.log(`  Success : ${success}/${allJobs.length}`);
  console.log(`  Errors  : ${errors}`);
  console.log(`\nNext: run  npx tsx scripts/bt-seed-missing.ts  to load into Supabase`);
  console.log('─────────────────────────────────────────\n');

  await browser.close();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
