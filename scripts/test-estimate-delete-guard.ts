/**
 * TDD tests for estimate deletion guard logic.
 * Tests verify estimateDeletionBlockedReason and resolveDeletePermission.
 */

import assert from 'node:assert/strict'
import { estimateDeletionBlockedReason, resolveDeletePermission } from '../src/lib/estimates/deleteGuard'

let passed = 0, failed = 0
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++ }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); failed++ }
}

// ─── estimateDeletionBlockedReason ────────────────────────────────────────────
console.log('\nestimation deletion guard — estimateDeletionBlockedReason')

const clean = { status: 'draft', is_locked: false as boolean | null,
  client_approved_at: null, client_rejected_at: null,
  client_name: null, client_signature: null, client_response_note: null }

test('null estimate → not_found', () =>
  assert.equal(estimateDeletionBlockedReason(null), 'not_found'))

test('pristine draft → null (deletable)', () =>
  assert.equal(estimateDeletionBlockedReason(clean), null))

test('status=approved → approved', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'approved' }), 'approved'))

test('status=sent → sent', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'sent' }), 'sent'))

test('status=rejected → rejected', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'rejected' }), 'rejected'))

test('status=voided → voided', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'voided' }), 'voided'))

test('unknown status → unknown_status (fail closed)', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'in_review' }), 'unknown_status'))

test('is_locked=true → locked', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, is_locked: true }), 'locked'))

test('is_locked=null → locked (fail closed, only false allowed)', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, is_locked: null }), 'locked'))

test('client_approved_at set → client_response', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, client_approved_at: '2026-10-01T00:00:00Z' }), 'client_response'))

test('client_rejected_at set → client_response', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, client_rejected_at: '2026-10-01T00:00:00Z' }), 'client_response'))

test('client_name set → client_response', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, client_name: 'Alice Smith' }), 'client_response'))

test('client_signature set → client_response', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, client_signature: 'Alice Smith' }), 'client_response'))

test('client_response_note set → client_response', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, client_response_note: 'Approved with changes' }), 'client_response'))

test('status check takes priority over locked', () =>
  assert.equal(estimateDeletionBlockedReason({ ...clean, status: 'approved', is_locked: true }), 'approved'))

// ─── resolveDeletePermission ──────────────────────────────────────────────────
console.log('\nestimation deletion guard — resolveDeletePermission')

test('estimates row with can_view+can_delete=true → allowed', () =>
  assert.equal(resolveDeletePermission({ can_view: true, can_delete: true }, null), true))

test('estimates row with can_view=true but can_delete=false → denied', () =>
  assert.equal(resolveDeletePermission({ can_view: true, can_delete: false }, { can_view: true, can_delete: true }), false))

test('[CORRECTION] estimates row present with can_view=false DENIES even if budget allows', () =>
  // Row EXISTS but view is false → explicit deny; budget is NOT consulted
  assert.equal(resolveDeletePermission({ can_view: false, can_delete: false }, { can_view: true, can_delete: true }), false))

test('[CORRECTION] estimates row present with can_view=false, can_delete=true still DENIES', () =>
  assert.equal(resolveDeletePermission({ can_view: false, can_delete: true }, { can_view: true, can_delete: true }), false))

test('no estimates row, budget can_view+can_delete=true → allowed (fallback)', () =>
  assert.equal(resolveDeletePermission(null, { can_view: true, can_delete: true }), true))

test('no estimates row, budget can_delete=true but can_view=false → denied', () =>
  // Require can_view for budget too
  assert.equal(resolveDeletePermission(null, { can_view: false, can_delete: true }), false))

test('no estimates row, budget can_view=true but can_delete=false → denied', () =>
  assert.equal(resolveDeletePermission(null, { can_view: true, can_delete: false }), false))

test('no estimates row, no budget row → denied', () =>
  assert.equal(resolveDeletePermission(null, null), false))

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('')
if (failed > 0) { console.error(`FAILED ${failed}/${failed + passed}`); process.exit(1) }
else console.log(`PASSED ${passed}/${passed}`)
