/**
 * TDD tests for leadProposalTotals.
 *
 * Tests verify:
 *   1. Approved estimate wins over higher-version draft (existing behaviour preserved)
 *   2. Newest draft with lines wins over older draft with lines (existing behaviour)
 *   3. BUG FIX: empty/unpriced newer draft does NOT hide an older priced draft
 *   4. Lead with only an empty draft is omitted from the result (no price)
 *   5. Approved estimate with 0-price lines wins selection but emits no total (>0 guard)
 *   6. Multiple leads, mixed states
 *   7. Empty leadIds returns empty map immediately
 *   8. client_visible=false lines are excluded from the total
 */

import assert from 'node:assert/strict'
import { leadProposalTotals } from '../src/lib/estimates/leadProposalTotals'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Minimal mock Supabase builder ────────────────────────────────────────────
function mockClient(rows: unknown[]): SupabaseClient {
  const builder = {
    data: rows,
    error: null,
    select: () => builder,
    in:     () => builder,
  }
  return { from: () => builder } as unknown as SupabaseClient
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LEAD_A = 'lead-a'
const LEAD_B = 'lead-b'

function pricedLine(unitCost: number, markupPct = 0) {
  return { quantity: 1, unit_cost: unitCost, markup_pct: markupPct, client_visible: true }
}
function invisibleLine(unitCost: number) {
  return { quantity: 1, unit_cost: unitCost, markup_pct: 0, client_visible: false }
}

type EstRow = {
  lead_id: string
  status: string
  version: number
  estimate_lines: { quantity: number; unit_cost: number; markup_pct: number; client_visible: boolean | null }[]
}

function est(overrides: Partial<EstRow> & { lead_id: string; version: number }): EstRow {
  return { status: 'draft', estimate_lines: [], ...overrides }
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${e instanceof Error ? e.message : String(e)}`)
    failed++
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nleadProposalTotals')

  await test('empty leadIds returns empty map without querying', async () => {
    const result = await leadProposalTotals(null as unknown as SupabaseClient, [])
    assert.equal(result.size, 0)
  })

  await test('lead with only an empty draft: omitted (no price)', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), false, 'Empty draft should not appear in totals')
  })

  await test('lead with a priced draft: emits total', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(1000, 20)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), true)
    assert.equal(result.get(LEAD_A), 1200)
  })

  await test('[BUG FIX] newer empty draft does not hide older priced draft', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(5000)] }),
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), true, 'Lead should have a total (v1 priced)')
    assert.equal(result.get(LEAD_A), 5000, 'v1 total should be used, not empty v2')
  })

  await test('[BUG FIX] newer zero-cost draft does not hide older priced draft', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(3000, 10)] }),
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [pricedLine(0)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), true, 'Lead should have a total (v1 priced)')
    assert.equal(Math.round(result.get(LEAD_A)!), 3300, 'v1 priced total (3000 × 1.10) should be used')
  })

  await test('newest priced draft wins over older priced draft', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(1000)] }),
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [pricedLine(2000)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.get(LEAD_A), 2000, 'v2 should win')
  })

  await test('approved estimate wins over higher-version draft (existing behaviour)', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, status: 'approved', estimate_lines: [pricedLine(500)] }),
      est({ lead_id: LEAD_A, version: 2, status: 'draft',    estimate_lines: [pricedLine(9999)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.get(LEAD_A), 500, 'Approved v1 should beat draft v2')
  })

  await test('approved estimate with no lines: wins selection but emits no total', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, status: 'approved', estimate_lines: [] }),
      est({ lead_id: LEAD_A, version: 2, status: 'draft',    estimate_lines: [pricedLine(999)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), false,
      'Approved empty estimate wins selection but 0-total => no entry (existing behaviour)')
  })

  await test('client_visible=false lines excluded from total', async () => {
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [
        pricedLine(1000),
        invisibleLine(500),
      ]}),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.get(LEAD_A), 1000, 'Hidden line should not count toward total')
  })

  await test('multiple leads resolved independently', async () => {
    const rows: EstRow[] = [
      // LEAD_A: v2 empty, v1 priced → v1 wins (bug-fix case)
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(800)] }),
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [] }),
      // LEAD_B: v1 approved, v2 sent → approved wins
      est({ lead_id: LEAD_B, version: 1, status: 'approved', estimate_lines: [pricedLine(1500)] }),
      est({ lead_id: LEAD_B, version: 2, status: 'sent',     estimate_lines: [pricedLine(2500)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A, LEAD_B])
    assert.equal(result.get(LEAD_A), 800,  'LEAD_A: v1 priced wins')
    assert.equal(result.get(LEAD_B), 1500, 'LEAD_B: approved v1 wins')
  })

  // ── Regression tests ────────────────────────────────────────────

  await test('[REGRESSION] newer draft where ALL lines hidden-only does not win over older priced draft', async () => {
    // v2 has lines but all client_visible=false → total is 0 → should not win
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(4500)] }),
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [
        { quantity: 1, unit_cost: 999, markup_pct: 0, client_visible: false },
        { quantity: 1, unit_cost: 999, markup_pct: 0, client_visible: false },
      ]}),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), true, 'Lead should have a total (v1 priced visible)')
    assert.equal(result.get(LEAD_A), 4500, 'v1 visible total should be used, not v2 hidden-only')
  })

  await test('[REGRESSION] DB response order (desc version) does not affect selection', async () => {
    // DB returns rows in descending version order (typical .order("version", {ascending:false}))
    // v2 is empty, v1 is priced — even received first, v1 should win
    const rows: EstRow[] = [
      est({ lead_id: LEAD_A, version: 2, estimate_lines: [] }),    // received first (desc order)
      est({ lead_id: LEAD_A, version: 1, estimate_lines: [pricedLine(7500)] }),
    ]
    const result = await leadProposalTotals(mockClient(rows), [LEAD_A])
    assert.equal(result.has(LEAD_A), true, 'Lead should have a total')
    assert.equal(result.get(LEAD_A), 7500, 'v1 priced wins regardless of row order')
  })

  console.log('')
  if (failed > 0) {
    console.error(`FAILED ${failed}/${failed + passed}`)
    process.exit(1)
  } else {
    console.log(`PASSED ${passed}/${passed}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
