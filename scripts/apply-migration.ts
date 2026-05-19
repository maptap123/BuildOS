/**
 * Applies a SQL migration file directly to Supabase via the REST API.
 * Usage: npx tsx scripts/apply-migration.ts supabase/migrations/004_logs_contacts_photos.sql
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/apply-migration.ts <migration-file>');
  process.exit(1);
}

const sqlPath = join(process.cwd(), migrationFile);
if (!existsSync(sqlPath)) {
  console.error(`File not found: ${sqlPath}`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf-8');

// Split into individual statements, skipping blank lines and comment-only blocks
function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // Track dollar-quoting (e.g. $$ ... $$)
    if (!inDollarQuote) {
      const match = trimmed.match(/\$\w*\$/);
      if (match) {
        inDollarQuote = true;
        dollarTag = match[0];
      }
    } else if (trimmed.includes(dollarTag)) {
      inDollarQuote = false;
    }

    current += line + '\n';

    // A semicolon at end of statement (outside dollar quotes) terminates it
    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && !/^--/.test(stmt)) stmts.push(stmt);
      current = '';
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(Boolean);
}

async function execSQL(statement: string): Promise<{ ok: boolean; error?: string }> {
  // Supabase exposes a SQL execution endpoint via the pg meta service
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ sql_text: statement }),
  });

  if (response.ok) return { ok: true };

  // Try alternative param name
  const response2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ query: statement }),
  });

  if (response2.ok) return { ok: true };

  const errBody = await response2.text().catch(() => '');
  return { ok: false, error: errBody || `HTTP ${response2.status}` };
}

async function main() {
  const statements = splitStatements(sql);
  console.log(`\nApplying ${migrationFile}`);
  console.log(`  ${statements.length} statements found\n`);

  let passed = 0;
  let failed = 0;
  const failedStatements: string[] = [];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 60);
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);

    const result = await execSQL(stmt);
    if (result.ok) {
      console.log('✓');
      passed++;
    } else {
      console.log(`✗  ${result.error?.slice(0, 80) ?? 'error'}`);
      failed++;
      failedStatements.push(stmt);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  if (failed === 0) {
    console.log(`✓ Migration applied successfully (${passed} statements)`);
  } else {
    console.log(`⚠  ${passed} succeeded, ${failed} failed`);
    console.log(`\nThe exec_sql RPC function is not available on this project.`);
    console.log(`Apply the migration manually in the Supabase SQL Editor:`);
    console.log(`  https://supabase.com/dashboard/project/hdebklbhscvmdnatngkp/sql/new`);
    console.log(`\nPaste the contents of: ${migrationFile}`);
  }
  console.log(`─────────────────────────────────────────\n`);
}

main().catch(e => {
  console.error('Fatal:', e.message ?? e);
  process.exit(1);
});
