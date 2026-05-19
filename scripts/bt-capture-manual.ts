/**
 * Buildertrend diagnostic: capture API calls while you navigate manually.
 *
 * Use this when guessed Buildertrend URLs show 404. The script opens a logged-in
 * browser, then records API requests/responses while you use Buildertrend like a
 * normal user. Navigate to a job's Daily Logs page, scroll/load more, and open
 * print/export if relevant. The capture is saved under bt-export/diagnostics.
 *
 * Usage:
 *   npx.cmd tsx scripts/bt-capture-manual.ts --minutes 3
 */

import { chromium, type Request, type Response } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BT_URL = 'https://buildertrend.net';
const PROFILE_DIR = join(process.cwd(), '.bt-profile');
const OUTPUT_DIR = join(process.cwd(), 'bt-export', 'diagnostics');

function argValue(name: string): string | null {
  const exact = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const minutes = Number(argValue('--minutes') ?? 3);
const durationMs = Math.max(30_000, Math.min(15 * 60_000, minutes * 60_000));
const outPath = join(OUTPUT_DIR, `manual-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

type CaptureEntry = {
  at: string;
  method: string;
  url: string;
  resourceType: string;
  postData: string | null;
  status?: number;
  responseSummary?: string;
  responseBodySample?: string;
};

function isInteresting(url: string) {
  return url.includes('/api/')
    || /daily.?log|logs?|photo|attachment|print/i.test(url);
}

function summarizeJson(json: unknown) {
  if (!json || typeof json !== 'object') return '';
  const value = json as Record<string, unknown>;
  const data = value.data as Record<string, unknown> | unknown[] | undefined;
  const dailyLogs = !Array.isArray(data) && data?.dailyLogs;
  const dataRows = !Array.isArray(data) && data?.data;
  const rows = Array.isArray(dailyLogs)
    ? dailyLogs
    : Array.isArray(dataRows)
      ? dataRows
      : Array.isArray(data)
        ? data
        : null;
  const keys = Object.keys(value).join(',');
  return rows ? `keys=${keys}; rows=${rows.length}` : `keys=${keys}`;
}

async function responseSummary(response: Response) {
  const contentType = response.headers()['content-type'] ?? '';
  try {
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return {
        summary: summarizeJson(json),
        sample: JSON.stringify(json).slice(0, 2000),
      };
    }
    const text = await response.text();
    return {
      summary: `text ${text.length} chars`,
      sample: text.slice(0, 2000),
    };
  } catch (error) {
    return {
      summary: `unreadable response: ${error instanceof Error ? error.message : String(error)}`,
      sample: '',
    };
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const entries = new Map<Request, CaptureEntry>();
  const saved: CaptureEntry[] = [];
  const persist = () => writeFileSync(outPath, JSON.stringify(saved, null, 2));

  console.log('Opening Buildertrend. Use the browser manually.');
  console.log('Navigate to the job Daily Logs page that has the correct data.');
  console.log(`Capturing for ${Math.round(durationMs / 1000)} seconds...\n`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  page.on('request', request => {
    const url = request.url();
    if (!isInteresting(url)) return;
    entries.set(request, {
      at: new Date().toISOString(),
      method: request.method(),
      url: url.replace(BT_URL, ''),
      resourceType: request.resourceType(),
      postData: request.postData(),
    });
  });

  page.on('response', response => {
    const request = response.request();
    const entry = entries.get(request);
    if (!entry) return;
    responseSummary(response)
      .then(summary => {
        entry.status = response.status();
        entry.responseSummary = summary.summary;
        entry.responseBodySample = summary.sample;
        saved.push(entry);
        console.log(`${entry.method} ${entry.url} -> ${entry.status} ${entry.responseSummary ?? ''}`);
        if (/DailyLogs\/grid/i.test(entry.url) && entry.postData) {
          console.log(`GRID BODY ${entry.postData}`);
        }
        persist();
      })
      .catch(error => {
        entry.status = response.status();
        entry.responseSummary = `inspect failed: ${error instanceof Error ? error.message : String(error)}`;
        saved.push(entry);
        persist();
      });
  });

  try {
    await page.goto(BT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    if (!page.url().includes('/app/')) {
      console.log('Please log in if prompted. Capture continues after login.');
    }

    await page.waitForTimeout(durationMs);
  } finally {
    persist();
    console.log(`\nSaved ${saved.length} captured calls to:`);
    console.log(outPath);

    if (!existsSync(outPath)) throw new Error('Capture file was not written');
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
