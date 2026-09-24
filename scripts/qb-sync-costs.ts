/**
 * Run the QuickBooks → actuals job cost sync from the command line (the same code
 * the daily cron runs: src/lib/quickbooks/costSync.ts).
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
  const started = Date.now();
  const result = await syncQuickBooksCosts(createAdminClient());
  console.log(JSON.stringify(result, null, 2));
  console.log(`Took ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
