/**
 * Run the QuickBooks pull from the command line — job costs → actuals and client
 * billing → job_billing (the same code the daily cron runs). --billing-only skips costs.
 *
 * .env.local holds the Intuit *sandbox* keys, and a token refresh needs the
 * production pair, so pass them in for the run:
 *   QB_CLIENT_ID=... QB_CLIENT_SECRET=... npx tsx scripts/qb-sync-costs.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
process.env.QB_ENVIRONMENT = 'production';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { syncQuickBooksCosts } = await import('../src/lib/quickbooks/costSync');
  const { syncQuickBooksBilling } = await import('../src/lib/quickbooks/billingSync');
  const started = Date.now();
  const admin = createAdminClient();
  const skipCosts = process.argv.includes('--billing-only');
  if (!skipCosts) console.log('costs', JSON.stringify(await syncQuickBooksCosts(admin), null, 2));
  console.log('billing', JSON.stringify(await syncQuickBooksBilling(admin), null, 2));
  console.log(`Took ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
