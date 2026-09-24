/**
 * BuilderTrend → Supabase: load estimate worksheets as job budgets.
 *
 * Reads bt-export/by-job/{id}/estimate.json (written by bt-migrate-estimates.ts)
 * and writes one budget_lines row per BT worksheet line item:
 *   cost_code       ← itemTitle      ("02.3070." — keeps BT's trailing dot, same as cost_catalog)
 *   phase           ← costCodeTitle  ("02 Site Preparation" — phases are cost code divisions)
 *   category        ← worksheet group title ("Master Bath")
 *   original_budget ← builderCost    (qty × unit cost, before markup)
 *   notes           ← unit/qty/unit cost, markup and client price, so nothing BT had is lost
 *
 * Budget lines, not estimate_lines: BuildOS estimates hang off a lead
 * (estimate_lines.lead_id is NOT NULL) and require a labor/material/sub split
 * that BT worksheets do not carry.
 *
 * Safe to re-run: upserts on budget_lines (job_id, bt_line_item_id) (migrations 052-053), and
 * removes BT lines that were deleted from the worksheet since the last run.
 *
 * Usage:
 *   npx tsx scripts/bt-seed-estimates.ts            # dry run: per-job counts and totals
 *   npx tsx scripts/bt-seed-estimates.ts --apply
 *   npx tsx scripts/bt-seed-estimates.ts --apply --job-id 45963052
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const BY_JOB = join(process.cwd(), 'bt-export', 'by-job');
const APPLY = process.argv.includes('--apply');
const jobIdx = process.argv.indexOf('--job-id');
const ONLY_JOB = jobIdx >= 0 ? process.argv[jobIdx + 1] : null;

// BT worksheet lineItemType: 10 = cost line, 7 = allowance (client price only,
// builderCost 0), 5 = client selection pushed in from BT Selections (a chosen
// product with a client price and $0 cost). Selections are not budget lines.
const ALLOWANCE = 7;
const SELECTION = 5;

type BtLine = {
  id: number;
  lineItemType: number;
  itemTitle: string | null;
  costCodeTitle: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  builderCost: number | null;
  markupPercent: number | null;
  ownerPrice: number | null;
  internalNotes: string | null;
};
type BtWorksheet = {
  data?: {
    worksheetLocked?: boolean;
    lockedByName?: string | null;
    lockedByDate?: string | null;
    formatData?: Array<{ title: string | null; lineItems?: BtLine[] }>;
  };
};

type BtBudget = {
  totalValues?: { originalBudgetCosts?: number | null };
  costCategories?: Array<{ title: string; costCodes?: Array<{ id: number; title: string; originalBudgetCosts: number | null }> }>;
};

type Row = {
  bt_line_item_id: number;
  cost_code: string;
  phase: string | null;
  category: string;
  description: string;
  cost: number;
  notes: string;
};

/** Budget cost of a worksheet line. Allowances carry only a client price, so back the markup out. */
function lineCost(l: BtLine): number {
  const builder = Number(l.builderCost ?? 0);
  if (builder || l.lineItemType !== ALLOWANCE) return builder;
  const price = Number(l.ownerPrice ?? 0);
  return l.markupPercent ? price / (1 + Number(l.markupPercent) / 100) : price;
}

function worksheetRows(ws: BtWorksheet): Row[] {
  const d = ws.data;
  const locked = d?.worksheetLocked
    ? `BT worksheet locked by ${d.lockedByName ?? 'unknown'} ${d.lockedByDate?.slice(0, 10) ?? ''}`.trim()
    : 'BT worksheet (unlocked)';
  return (d?.formatData ?? []).flatMap((g) => (g.lineItems ?? []).map((l) => ({ l, group: g.title?.trim() || 'General' })))
    .filter(({ l }) => l.lineItemType !== SELECTION && (lineCost(l) !== 0 || Number(l.ownerPrice ?? 0) !== 0))
    .map(({ l, group }) => ({
      bt_line_item_id: l.id,
      // Cost lines keep their code in itemTitle ("02.3070."); allowances put a name there instead.
      cost_code: l.lineItemType === 10 ? (l.itemTitle?.trim() || 'BT') : (l.costCodeTitle?.split(' ')[0] || 'BT'),
      phase: l.costCodeTitle?.trim() || null,
      category: group,
      description: (l.lineItemType === 10 ? l.description?.trim() : null) || l.itemTitle?.trim() || 'BuilderTrend line',
      cost: lineCost(l),
      notes: [
        l.lineItemType === ALLOWANCE ? 'Allowance' : null,
        `${l.quantity ?? 0} ${l.unit || 'EA'} @ ${money(Number(l.unitCost ?? 0))}`,
        l.markupPercent != null ? `markup ${l.markupPercent}%` : null,
        l.ownerPrice != null ? `client price ${money(Number(l.ownerPrice))}` : null,
        l.lineItemType === 10 ? null : (l.description?.trim() || null),
        l.internalNotes?.trim() || null,
        locked,
      ].filter(Boolean).join(' · '),
    }));
}

/**
 * Rows from BT's legacy job-costing budget (one per cost code). Used only when the
 * worksheet doesn't account for the budget (e.g. Tighe Garage has a budget and no
 * worksheet). BT cost-code ids are stored negated so they can never collide with
 * worksheet line-item ids in the shared bt_line_item_id column. They are also
 * company-wide, not per job, which is why the upsert key is (job_id, bt_line_item_id).
 */
function budgetRows(b: BtBudget): Row[] {
  return (b.costCategories ?? []).flatMap((c) => (c.costCodes ?? [])
    .filter((cc) => Number(cc.originalBudgetCosts ?? 0) !== 0)
    .map((cc) => ({
      bt_line_item_id: -cc.id,
      cost_code: cc.title.split(' ')[0],
      phase: cc.title,
      category: c.title,
      description: cc.title,
      cost: Number(cc.originalBudgetCosts),
      notes: 'BT job costing budget (original budget by cost code)',
    })));
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const { data: migUser } = await supabase.from('users').select('id').eq('email', 'migration@jdc-platform.internal').maybeSingle();
  if (!migUser) throw new Error('migration@jdc-platform.internal not found — run bt-seed.ts first');

  const { data: jobs, error: jobsErr } = await supabase.from('jobs').select('id, job_number, name').not('job_number', 'is', null).limit(2000);
  if (jobsErr) throw jobsErr;
  const jobByBtId = new Map(jobs!.map((j) => [String(j.job_number), j]));

  const dirs = ONLY_JOB ? [ONLY_JOB] : readdirSync(BY_JOB);
  let jobsLoaded = 0, linesLoaded = 0, removed = 0, grandTotal = 0;
  const unmatched: string[] = [];

  for (const btJobId of dirs) {
    const wsPath = join(BY_JOB, btJobId, 'estimate.json');
    const budgetPath = join(BY_JOB, btJobId, 'budget.json');
    const wsRows = existsSync(wsPath) ? worksheetRows(JSON.parse(readFileSync(wsPath, 'utf-8')) as BtWorksheet) : [];
    const btBudget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf-8')) as BtBudget : null;
    const budgetTotal = Number(btBudget?.totalValues?.originalBudgetCosts ?? 0);

    // Worksheet is the source unless BT's own budget has an original budget the worksheet doesn't match.
    const wsTotal = wsRows.reduce((s, r) => s + r.cost, 0);
    const useBudget = budgetTotal !== 0 && Math.abs(wsTotal - budgetTotal) > Math.max(1, budgetTotal * 0.01);
    const source = useBudget ? budgetRows(btBudget!) : wsRows;
    if (source.length === 0) continue;

    const job = jobByBtId.get(btJobId);
    if (!job) { unmatched.push(btJobId); continue; }

    const rows = source.map((r) => ({
      job_id: job.id,
      bt_line_item_id: r.bt_line_item_id,
      cost_code: r.cost_code,
      phase: r.phase,
      category: r.category,
      description: r.description,
      status: 'approved',
      original_budget: r.cost,
      revised_budget: r.cost,
      committed_cost: 0,
      forecast_cost: r.cost,
      notes: r.notes,
      created_by: migUser.id,
    }));
    const total = rows.reduce((s, r) => s + r.original_budget, 0);
    grandTotal += total;
    const why = useBudget ? ` [from BT budget; worksheet had ${money(wsTotal)}]` : '';
    console.log(`${job.name} (${btJobId}): ${rows.length} lines, ${money(total)}${why}`);

    if (APPLY) {
      const { error } = await supabase.from('budget_lines').upsert(rows, { onConflict: 'job_id,bt_line_item_id' });
      if (error) throw new Error(`${job.name}: ${error.message}`);

      // Drop BT lines that no longer exist on the worksheet. Native lines (bt_line_item_id NULL) are untouched.
      const keep = new Set(rows.map((r) => r.bt_line_item_id));
      const { data: existing } = await supabase.from('budget_lines').select('id, bt_line_item_id').eq('job_id', job.id).not('bt_line_item_id', 'is', null);
      const stale = (existing ?? []).filter((e) => !keep.has(Number(e.bt_line_item_id))).map((e) => e.id);
      if (stale.length) {
        const { error: delErr } = await supabase.from('budget_lines').delete().in('id', stale);
        if (delErr) throw new Error(`${job.name}: ${delErr.message}`);
        removed += stale.length;
      }
    }
    jobsLoaded++;
    linesLoaded += rows.length;
  }

  console.log(`\n${APPLY ? 'Loaded' : 'Would load'} ${linesLoaded} lines across ${jobsLoaded} jobs, ${money(grandTotal)} total budget.${APPLY ? ` Removed ${removed} stale BT lines.` : ''}`);
  if (unmatched.length) console.log(`No BuildOS job for BT job ids: ${unmatched.join(', ')}`);
  if (!APPLY) console.log('Dry run — pass --apply to write.');
}

main().catch((err) => { console.error(err); process.exit(1); });
