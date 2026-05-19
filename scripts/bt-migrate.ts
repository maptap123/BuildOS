/**
 * BuilderTrend → JDC Platform Migration Script
 *
 * Extracts all jobs (active + closed), daily logs, photos, documents,
 * calendar items, change orders, contacts, and purchase orders from
 * BuilderTrend's internal API using an authenticated browser session.
 *
 * Usage:
 *   npm install -D playwright tsx
 *   npx playwright install chromium
 *   npx tsx scripts/bt-migrate.ts
 *
 * Output: bt-export/
 *   jobs.json              — all 238 jobs with metadata
 *   by-job/{jobId}/
 *     logs.json            — daily logs (notes, weather, author)
 *     photos.json          — photo metadata
 *     documents.json       — document metadata
 *     calendar.json        — schedule/calendar items
 *     changeOrders.json    — change orders with pricing + status
 *     contacts.json        — clients/contacts linked to job
 *     purchaseOrders.json  — purchase orders
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BUILDER_ID = 69084;
const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
  console.log(`    saved ${file}`);
}

// Run a fetch() call inside the browser so session cookies are included automatically
async function btGet(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (url: string) => {
    const r = await fetch(url, { headers: { portaltype: '1' } });
    if (!r.ok) return { _error: r.status };
    return r.json();
  }, path);
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

// AG Grid-style endpoint used by ChangeOrders, Contacts, PurchaseOrders
function gridBody(jobIds: number[], pageSize = 2000) {
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
      pageNumber: '1',
      pageSize,
      resetScroll: false,
      firstRow: 1,
      lastRow: pageSize,
      totalRowsAllPages: pageSize,
      currentPage: 1,
    },
    filters: {},
    jobIds,
  };
}

async function main() {
  console.log('Launching browser (will reuse saved session if available)...');

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  await page.goto(BT_URL);
  await page.waitForLoadState('networkidle');

  if (!page.url().includes('/app/')) {
    console.log('\nNot logged in. Please log in to BuilderTrend in the browser window.');
    console.log('Press Enter here once you are logged in...');
    await new Promise<void>((r) => process.stdin.once('data', () => r()));
    await page.waitForLoadState('networkidle');
  }

  console.log('\nLogged in. Starting extraction...\n');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ─── 1. ALL JOBS (238 including closed/warranty/presale) ──────────────────
  console.log('[1/7] Fetching all jobs...');
  const jobsResp = (await btPost(page, '/api/jobpicker/GetJobPickerData', {
    filters: JSON.stringify({ '1': '', '2': '', '3': '5,1,7,2', '7': '' }),
    displayMode: 2,
    jobSortChoice: 1,
    selectedJobId: 0,
    isExpanded: true,
    templatesOnly: false,
    selectMode: 2,
    useJobInSession: false,
    allowGlobalJob: false,
    includeGeneralJob: false,
    builderId: String(BUILDER_ID),
    includeCounts: false,
  })) as { data: { jobs: Array<{ jobId: number; jobName: string }> } };

  const allJobs = jobsResp.data.jobs.filter((j) => j.jobId !== 0);
  save(OUTPUT_DIR, 'jobs.json', allJobs);
  console.log(`  ✓ ${allJobs.length} total jobs\n`);

  const jobIds = allJobs.map((j) => j.jobId);

  // ─── 2. PER-JOB DATA ──────────────────────────────────────────────────────
  console.log(`[2/7] Extracting data for each of ${jobIds.length} jobs...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    const jobName = allJobs[i].jobName;
    const jobDir = join(OUTPUT_DIR, 'by-job', String(jobId));

    process.stdout.write(`\n  [${i + 1}/${jobIds.length}] ${jobName} (${jobId})\n`);

    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    // GET endpoints
    const getEndpoints: [string, string][] = [
      ['logs', `/api/Logs?jobId=${jobId}`],
      ['photos', `/api/Photos?jobId=${jobId}`],
      ['documents', `/api/Documents?jobId=${jobId}`],
      ['calendar', `/api/Calendar?jobId=${jobId}`],
    ];

    for (const [key, url] of getEndpoints) {
      try {
        results[key] = await btGet(page, url);
      } catch (e: unknown) {
        results[key] = { _error: String(e) };
        errors.push(key);
      }
    }

    // Grid (POST) endpoints
    const gridEndpoints: [string, string][] = [
      ['changeOrders', '/api/ChangeOrders/Grid'],
      ['contacts', '/api/Contacts/Grid'],
      ['purchaseOrders', '/api/PurchaseOrders/Grid'],
    ];

    for (const [key, endpoint] of gridEndpoints) {
      try {
        results[key] = await btPost(page, endpoint, gridBody([jobId]));
      } catch (e: unknown) {
        results[key] = { _error: String(e) };
        errors.push(key);
      }
    }

    // Save each module to its own file
    for (const [module, data] of Object.entries(results)) {
      save(jobDir, `${module}.json`, data);
    }

    if (errors.length) {
      console.log(`    ⚠ errors on: ${errors.join(', ')}`);
      errorCount++;
    } else {
      successCount++;
    }

    // Rate limit — 300ms between jobs is respectful without being slow
    await sleep(300);
  }

  // ─── 3. COMPANY-WIDE CONTACTS ─────────────────────────────────────────────
  console.log('\n[3/7] Fetching company-wide contacts...');
  try {
    const contacts = await btPost(page, '/api/Contacts/Grid', {
      ...gridBody([]),
      jobIds: undefined,
      filters: { displayName: '' },
    });
    save(OUTPUT_DIR, 'contacts.json', contacts);
  } catch (e) {
    console.log(`  ⚠ contacts failed: ${e}`);
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`✓ Extraction complete`);
  console.log(`  Jobs processed : ${jobIds.length}`);
  console.log(`  Successful     : ${successCount}`);
  console.log(`  With errors    : ${errorCount}`);
  console.log(`  Output dir     : ${OUTPUT_DIR}`);
  console.log('─────────────────────────────────────────\n');
  console.log('Next step: run  npx tsx scripts/bt-seed.ts  to load into Supabase.');

  await browser.close();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
