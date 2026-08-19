# BuildOS Permissions Matrix — Week 2 Day 8

Reference for configuring `user_permissions` rows (Admin → Users) for every real account before
launch. There is no `role` column in the schema — access is a per-user, per-module set of
booleans (`can_view/create/edit/delete/export/manage`). The four roles below are the intended
*bundles* to apply per person; `admin.can_manage = true` always bypasses every other module gate
(server-side, not just in the UI) — grant it only to the owner/office admin.

Legend: **V**=view **C**=create **E**=edit **D**=delete **—**=no access. Money-sensitive modules
are bolded — these are what the launch checklist's "crew never sees contract value, margin,
bills, PO amounts, profitability" requirement is actually gating.

| Module | Owner/Admin | Office (PM/Lisa) | Field Super | Crew (Jason/Cane) |
|---|---|---|---|---|
| admin | manage | — | — | — |
| jobs | VCED | VCED | V (assigned) | V |
| leads | VCED | VCED | — | — |
| contacts | VCED | VCED | VCE | V |
| vendors | VCED | VCED | V | — |
| **budget** | VCED | VCED | — | — |
| **finance** | VCED | VCED | — | — |
| **profitability** | VCED | VCED | — | — |
| **estimates** | VCED | VCED | — | — |
| schedule | VCED | VCED | VCE | V |
| tasks | VCED | VCED | VCE | VE (own) |
| logs | VCED | VCED | VCE | VC |
| photos | VCED | VCED | VC | VC |
| documents | VCED | VCED | VC | V (per-file, see `job_file_permissions`) |
| time_clock | VCED + manage (shift approval) | VCED + manage | VCE (own crew) | VC (own) |
| ai | VCED | VCED | VC | VC (Fixer + AI Log Mode) |

## Why these boundaries

- **Money modules (bold)** — crew and field super get nothing. This is enforced at three layers,
  not just the nav: the API route's `user_permissions` check, Postgres RLS on the underlying
  tables, and (as of this audit) field-stripping on `/api/jobs` and `/api/jobs/[id]` so
  `contract_amount`/`estimated_cost` never appear in a JSON response to a caller without
  `budget.can_view` — including from the Hermes/Fixer AI tool paths, which had the same leak.
- **leads** is sales-pipeline data (client PII + deal value) — office-only, matching the nav's
  existing `canManageOffice` gate. Previously the API and RLS both checked `jobs.can_view`
  instead of `leads.can_view`, so any crew account could read/edit/delete it directly. Fixed
  2026-08-19 (migration 034, `src/app/api/leads/**`).
- **vendors** is subcontractor cost/insurance data — office-only, matching the nav's dedicated
  `vendors.can_view` gate. Same `jobs` vs `vendors` module bug, plus the RLS policy was
  `USING (true) FOR ALL` — any authenticated user could read/write/delete every vendor record
  with zero permission check. Fixed 2026-08-19 (migration 034, `src/app/api/vendors/**`).
- **contacts** stays `jobs`-scoped on purpose, not a bug: it's job-site contact info (homeowner,
  subs on that job) that crew needs for the Week 1 tap-to-call/text feature on mobile job detail.
  Gating it behind a separate `contacts` permission crew doesn't have would break that shipped
  feature, so this one module intentionally inherits `jobs.can_view`.
- **time_clock** has an intentional default-allow: a user with *no* `time_clock` permission row
  still gets clock-in access (`src/app/(dashboard)/time-clock/page.tsx`), since every crew member
  needs to clock in from day one without office having to provision a row first. Don't "fix" this
  into a lockout — it's the one deliberate exception to the deny-by-default rule everywhere else.

## Current live state (2026-08-19)

Only two real accounts exist pre-launch:

- `august@jdcremodeling.com` — full Owner/Admin (`admin.can_manage=true`), plus an explicit
  `leads` row. Everything else falls through the admin bypass added in this audit, so no other
  rows are strictly required — but for the UI's own client-side `usePermissions()` gating (which
  doesn't know about the server's admin-bypass helper) to show the right nav items, give the
  owner explicit rows for every module when convenient.
- `chadbyrnejdc@gmail.com` — was `jobs.can_view` only; brought up to the full Crew bundle during
  this audit (`schedule`, `tasks`, `logs`, `photos`, `time_clock`, `contacts`, `ai`) so Fixer,
  AI Log Mode, Schedule, and Tasks don't 403 for this account.
- Lisa's account is not yet created — needs the full Office bundle above. This now works: the
  live DB's `user_permissions_module_check` constraint only allowed 11 of the 16 modules in the
  app's `PermissionModule` type (missing `finance`, `profitability`, `estimates`, `photos`,
  `vendors` — migration 026 existed locally to add them but had never actually been applied to
  the live database). Before this fix, granting a non-admin user explicit access to any of those
  five modules would have failed with a DB constraint error — meaning Lisa could only have been
  set up as a full admin (bypassing every module gate) or left without office access entirely.
  Applied 2026-08-19.
- No Field Super account exists yet; the tier is documented for when one is provisioned (the
  `jobs.superintendent_id` column already exists for assigning one per job).

## What changed in this audit (2026-08-19)

Server-side (API routes matter more than UI — a route with no permission check is reachable by
any authenticated user regardless of what the nav hides):

1. `GET/PATCH /api/jobs/[id]` — now strips/gates `contract_amount`/`estimated_cost` on
   `budget.can_view`/`can_edit`, matching `GET /api/jobs` (list) which already did this.
2. Hermes `list_jobs`/`get_job` (`src/lib/hermes/tools.ts`, `src/app/api/agent/route.ts`) — same
   fields, same gate. Fixer could previously be asked "what's the contract value on job X" and
   answer it regardless of the asker's budget permission.
3. `leads/**` and `vendors/**` API routes were checking `module='jobs'` instead of their own
   module — fixed via a shared `hasModulePermOrAdmin()` helper (`src/lib/permissions/server.ts`).
4. `POST /api/ai` (log summarization, used by AI Log Mode) had zero permission check — added
   `ai.can_view` for parity with `/api/hermes/chat` and `/api/agent`, which already require it.
5. DB-level (migration 033 + 034): restored RLS policies on `time_entries` (had silently lost all
   4 policies when a later migration rebuilt the table), enabled RLS on `job_file_permissions` and
   `job_external_links` (never had it), fixed `leads` RLS to check the `leads` module, and replaced
   `vendors`' wide-open `USING (true)` policy with real per-action checks. All of this closes the
   "someone opens devtools and queries Supabase directly with their own session" bypass, not just
   the app's own API responses — verified clean on the Supabase security advisor afterward.

Lower-priority, not fixed (tracked for September, not launch-blocking): several PATCH handlers
(`contacts`, `leads`, `logs`) spread the request body straight into `.update()` without an
allow-list, so a caller who clears the edit-permission bar can set columns like `created_by` that
probably shouldn't be client-settable. Not money/PII-specific and lower risk than the items above.
