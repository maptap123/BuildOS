# Week 2 Day 10 — Smoke Test Pass Results (2026-08-19)

Ran the three money-path Playwright specs against the live database for the first time
(`tests/money-path-*.spec.ts`). **This found and fixed real, severe production bugs** — not
hypothetical ones. Before this pass, the estimate → proposal → accept → job path was completely
unreachable by real clients.

## What was actually broken

1. **`/proposals/[token]` redirected every visitor to `/login`.** `src/lib/supabase/middleware.ts`
   whitelisted `/co/` as a public route but never added `/proposals/`. Every homeowner clicking a
   proposal link in an email got bounced to a login page they have no account for. Fixed.
2. **`estimates.status` CHECK constraint didn't allow `'sent'`, `'rejected'`, or `'voided'`** — only
   `'draft'/'in_review'/'approved'/'exported'`, none of which match the app's actual
   `EstimateStatus` type or any code path. Clicking "Send" on an estimate, or a client declining a
   sent proposal, threw a DB error. Root cause: the `estimates` table was created directly on the
   live database at some point (it exists in Supabase's migration history as
   "create_estimating_tables" — no local `.sql` file in this repo defines the base table or its
   original constraint), so the constraint was never brought in line with the code. Fixed
   (migration 036).
3. **`schedule_items` was missing `percent_complete`, `trade`, `color`, and the `outlook_*`
   columns** — `POST /api/schedule` and the accepted-proposal → job starter-schedule step
   (`src/lib/proposals/conversion.ts`) both insert these columns unconditionally. Every schedule
   item creation, including the one that happens automatically when a proposal is accepted, failed
   with a schema-cache error. Root cause: `supabase/migrations/003_robust_features.sql` defines
   these columns correctly but was never applied to the live database at all (absent from
   Supabase's migration history) — while some *other* tables that same file also creates
   (`change_orders`, `integration_settings`) already existed, created some other way. Fixed
   (migration 037, applying only the genuinely-missing pieces of 003 to avoid "already exists"
   errors on the parts that weren't missing).
4. **Same root cause, more damage:** `tasks.estimated_hours`/`actual_hours`/`schedule_item_id`/
   `tags` and the entire `task_comments` table were also missing — meaning creating any task, or
   commenting on one, was broken. Also fixed in migration 037. `actuals.qb_bill_id`/`qb_vendor_id`/
   `po_number`/`payment_method`/`qb_synced` were missing too (would have broken QB bill sync once
   that's connected — see QB_SANDBOX_GO_NO_GO.md).

Combined with the Day 8 permissions audit finding two more unapplied migrations (021 — proposal
public tokens; 026 — permission module constraint), **the real lesson here is that this repo's
migration files and the live database have been drifting apart for a while**, and at least one
table (`estimates`) was created directly on the database with no corresponding file ever added to
`supabase/migrations/`. Recommend: before the next deploy, someone should run a full diff between
`supabase/migrations/*.sql` and the live schema (not just trust that "the file exists" means "it
ran") — I did this manually this session by checking specific columns/constraints one at a time,
which is exactly the kind of check that should happen automatically (e.g. `supabase db diff`
against the linked project, or a CI step) rather than being caught by luck during a smoke test.

## Test results (this session, local dev server against the live Supabase project)

| Path | Result | Notes |
|---|---|---|
| Estimate → proposal → accept → job | ✅ Pass (after 3 fixes above) | `tests/money-path-proposal-accept.spec.ts` — seeds real data, drives the real public page, verifies job + budget lines created in the DB, cleans up after itself |
| Change order → sign → status update | ✅ Pass, no fixes needed | `tests/money-path-change-order.spec.ts`. Note: approval does **not** currently update `budget_lines` — nothing in the codebase links an approved CO back to the budget. Not a bug introduced here, just documenting what the code actually does vs. what "CO → budget update" might imply; not a launch blocker per the plan's own scope, flagged for September |
| Bill (actual) → approve | ⏭ Not run for real | `tests/money-path-bill-approve.spec.ts` — requires an authenticated session (`PLAYWRIGHT_SESSION_COOKIE`), which needs a human to log in once and export the cookie; this environment has no way to mint one. Written and ready to run the moment that's available; matches the existing `tests/budget.spec.ts` convention |

## Go/no-go

- Estimate/proposal/CO money paths: **verified working now**, previously broken.
- Bill approve: code inspected (`PATCH /api/actuals/[id]`, correctly permission-gated, stamps
  `approved_by`/`approved_at`), not driven through the real UI in this session — someone with a
  real login should run the bill-approve spec once before Sept 1 to close the loop.
- All three smoke-test money paths per the original plan now have committed Playwright coverage.
