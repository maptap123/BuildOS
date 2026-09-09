/**
 * Unit cost = labor + material + sub
 * ==================================
 * Covers the bug that left 30 of the Schroeder estimate's 39 lines with a bare unit cost
 * and three empty buckets, and the rules that replaced it.
 *
 *   npx tsx scripts/verify-cost-splits.ts
 *
 * Part 1 is pure and offline. Part 2 hits the real database, because the defect was not in
 * the arithmetic — it was a query that silently returned 1,000 of ~34,500 rows, which only
 * a real dataset reproduces. It reads; it writes nothing.
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

import {
  splitOrDefault, unitCostFrom, reconcileLineUpdate, lineUnitCost, mergeCostTypeRows,
} from '../src/lib/estimates/costBreakdown'
import { fetchGroupSplits, groupKey } from '../src/lib/estimates/aiLines'
import { costCodeVariants, normalizeCostCode } from '../src/lib/estimates/costCodes'

// ─── Env ──────────────────────────────────────────────────────────────────────
const envFile = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && !(k in process.env)) process.env[k] = v
    }
  })
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ─── Part 1: the rules, offline ───────────────────────────────────────────────
function pureTests() {
  console.log('\nSplit rules')

  check('an unexplained price becomes material, not labor', () => {
    const s = splitOrDefault(1290, null)
    assert.equal(s.material_cost, 1290)
    assert.equal(s.labor_cost, null)
    assert.equal(s.sub_cost, null)
    // The refrigerator that would otherwise have read as $1,290 of labor.
    assert.equal(unitCostFrom(s), 1290)
  })

  check('a known split is kept and the unit cost follows it', () => {
    const s = splitOrDefault(999, { labor_cost: 1.13, material_cost: 1.10, sub_cost: null })
    assert.equal(s.labor_cost, 1.13)
    assert.equal(s.material_cost, 1.10)
    assert.equal(unitCostFrom(s), 2.23) // not 999, and not 2.2299999999999995
  })

  check('one bucket alone still counts as a split', () => {
    const s = splitOrDefault(50, { labor_cost: 29.92, material_cost: null, sub_cost: null })
    assert.equal(s.labor_cost, 29.92)
    assert.equal(s.material_cost, null)
    assert.equal(unitCostFrom(s), 29.92)
  })

  check('a zero price still yields a complete split', () => {
    assert.equal(unitCostFrom(splitOrDefault(0, null)), 0)
  })

  console.log('\nPartial updates')

  check('editing one bucket reprices from all three', () => {
    const merged = reconcileLineUpdate(
      { labor_cost: 2 },
      { labor_cost: 1.13, material_cost: 1.10, sub_cost: null }
    )
    assert.equal(merged.unit_cost, 3.10)
    assert.equal(merged.material_cost, 1.10) // untouched by the update
  })

  check('a bare unit cost cannot drift away from an existing split', () => {
    const merged = reconcileLineUpdate(
      { unit_cost: 9999 },
      { labor_cost: 1.13, material_cost: 1.10, sub_cost: null }
    )
    // The buckets are the price. 9999 would have violated the check constraint.
    assert.equal(merged.unit_cost, 2.23)
  })

  check('a bare unit cost on an unsplit line becomes material', () => {
    const merged = reconcileLineUpdate({ unit_cost: 163.8 }, {})
    assert.equal(merged.material_cost, 163.8)
    assert.equal(merged.unit_cost, 163.8)
  })

  check('an update that does not touch price is passed through', () => {
    const merged = reconcileLineUpdate({ description: 'Remove kitchen sink' }, {})
    assert.deepEqual(merged, { description: 'Remove kitchen sink' })
  })

  console.log('\nCost codes')

  check('the cost book trailing dot is not a different code', () => {
    // `02.4000.` in cost_catalog, `02.4000` in the workbooks — the same item.
    assert.equal(normalizeCostCode('02.4000.'), normalizeCostCode('02.4000'))
    assert.equal(normalizeCostCode(' 14.3000. '), '14.3000')
    assert.equal(normalizeCostCode('18.0070.AA0'), '18.0070.aa0') // an inner dot is real
    assert.equal(normalizeCostCode(null), '')
  })

  check('a lookup asks for both spellings', () => {
    const v = costCodeVariants(['02.4000'])
    assert.ok(v.includes('02.4000'))
    assert.ok(v.includes('02.4000.'))
    assert.equal(costCodeVariants(['02.4000', '02.4000.']).length, 2) // deduplicated
  })

  console.log('\nDisplay')

  check('row and totals read the same number', () => {
    const line = { unit_cost: 0, labor_cost: 1.13, material_cost: 1.10, sub_cost: null }
    // unit_cost is stale here; both callers must agree on the buckets.
    assert.equal(lineUnitCost(line), 2.23)
  })

  check('workbook rows merge by cost type', () => {
    const merged = mergeCostTypeRows([
      { cost_type: 'labor', unit_cost: 90 },
      { cost_type: 'materials', unit_cost: 600 },
      { cost_type: 'subcontract', unit_cost: 250 },
    ])
    assert.equal(merged.unit_cost, 940) // the dishwasher line
    assert.equal(merged.sub_cost, 250)
  })
}

// ─── Part 2: the lookup that actually broke, against real data ────────────────
async function liveTests() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\nSibling lookup (live)')

  // Every line on every estimate that cites a workbook line. This is the shape that
  // truncated: many descriptions, spread across scores of historical estimates.
  const { data: cited, error } = await admin
    .from('estimate_lines')
    .select('id, unit_cost, historical_estimate_lines!inner(historical_estimate_id, row_number)')
    .not('source_line_id', 'is', null)
  if (error) throw error

  const pairs = (cited ?? []).map(r => {
    const h = (r as Record<string, unknown>).historical_estimate_lines as {
      historical_estimate_id: string; row_number: number
    }
    return { historical_estimate_id: h.historical_estimate_id, row_number: Number(h.row_number) }
  })

  if (pairs.length === 0) {
    console.log('  – no comp-sourced lines to check')
    return
  }

  const splits = await fetchGroupSplits(admin, pairs)

  check(`every cited workbook line resolves its split (${pairs.length} lines)`, () => {
    const missing = pairs.filter(
      p => !splits.has(groupKey(p.historical_estimate_id, p.row_number))
    )
    // Before the fix this was 30 of 39 — silently, with no error anywhere.
    assert.equal(missing.length, 0, `${missing.length} lines came back with no split`)
  })

  check('each resolved split sums to its own unit cost', () => {
    for (const [key, s] of splits) {
      const sum = (s.labor_cost ?? 0) + (s.material_cost ?? 0) + (s.sub_cost ?? 0)
      assert.ok(Math.abs(sum - s.unit_cost) < 0.0001, `${key}: ${sum} != ${s.unit_cost}`)
    }
  })

  // The failure mode directly: a pair set far wider than one request can return. The old
  // query crossed `.in(estimate_ids)` with `.in(row_numbers)`, so at this size it asked
  // for hundreds of thousands of candidate rows and got back an arbitrary 1,000.
  const { data: wide, error: wideErr } = await admin
    .from('historical_estimate_lines')
    .select('historical_estimate_id, row_number')
    .limit(400)
  if (wideErr) throw wideErr

  const widePairs = [...new Map(
    (wide ?? []).map(r => [
      groupKey(r.historical_estimate_id as string, Number(r.row_number)),
      { historical_estimate_id: r.historical_estimate_id as string, row_number: Number(r.row_number) },
    ])
  ).values()]

  const wideSplits = await fetchGroupSplits(admin, widePairs)

  check(`a pair set wider than one request still resolves whole (${widePairs.length} pairs)`, () => {
    const missing = widePairs.filter(p => !wideSplits.has(groupKey(p.historical_estimate_id, p.row_number)))
    assert.equal(missing.length, 0, `${missing.length} of ${widePairs.length} pairs went missing`)
  })

  console.log('\nCost book reachability (live)')

  const { data: coded, error: codedErr } = await admin
    .from('estimate_lines')
    .select('cost_code')
    .not('cost_code', 'is', null)
  if (codedErr) throw codedErr

  const wantedCodes = [...new Set((coded ?? []).map(r => String(r.cost_code)))]
  const { data: book, error: bookErr } = await admin
    .from('cost_catalog')
    .select('cost_code')
    .in('cost_code', costCodeVariants(wantedCodes))
  if (bookErr) throw bookErr

  const bookCodes = new Set((book ?? []).map(r => normalizeCostCode(r.cost_code as string)))

  check(`most line cost codes reach the cost book (${wantedCodes.length} codes)`, () => {
    const found = wantedCodes.filter(c => bookCodes.has(normalizeCostCode(c)))
    // Compared literally this was 4 of 56 — the trailing dot made a line report that its
    // code "isn't in the cost book" while the entry sat right there.
    assert.ok(
      found.length > wantedCodes.length / 2,
      `only ${found.length} of ${wantedCodes.length} codes resolved`
    )
  })

  console.log('\nStored invariant (live)')

  const { data: rows, error: rowErr } = await admin
    .from('estimate_lines')
    .select('id, unit_cost, labor_cost, material_cost, sub_cost')
  if (rowErr) throw rowErr

  check(`every stored line adds up (${rows?.length ?? 0} lines)`, () => {
    const bad = (rows ?? []).filter(l => {
      const sum = Number(l.labor_cost ?? 0) + Number(l.material_cost ?? 0) + Number(l.sub_cost ?? 0)
      return Math.abs(sum - Number(l.unit_cost)) >= 0.0001
    })
    assert.equal(bad.length, 0, `${bad.length} lines disagree with their buckets`)
  })

  check('no line is left without a split', () => {
    const bare = (rows ?? []).filter(
      l => l.labor_cost === null && l.material_cost === null && l.sub_cost === null
    )
    assert.equal(bare.length, 0, `${bare.length} lines have a bare unit cost`)
  })
}

async function main() {
  pureTests()

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
    console.log('\n⚠  Skipping live checks — set NEXT_PUBLIC_SUPABASE_URL and')
    console.log('   SUPABASE_SERVICE_ROLE_KEY in .env.local to run them.')
  } else {
    await liveTests()
  }

  console.log(`\n${passed} checks passed.\n`)
}

main().catch(e => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`)
  process.exit(1)
})
