# BuilderTrend re-import runbook

Written for whoever runs the go-live data load. Last verified against the live DB **2026-09-23**.

---

## The decision: update in place, do not wipe

The question was whether to wipe BuildOS clean and re-import, or import the new
stuff and update the old. **Update in place.** Three findings settle it:

1. **Every BT-sourced table already carries its BuilderTrend source id.**
   `jobs.job_number`, `contacts.bt_contact_id`, `daily_logs.bt_log_id`,
   `log_photos.bt_photo_id`, `time_entries.bt_shift_id`. A re-import can match
   every existing row and update it. Nothing needs to be thrown away to get
   clean data.

2. **A wipe would orphan ~11,000 photo files.** `log_photos` rows cascade when a
   job is deleted, but the actual image files in the `job-photos` storage bucket
   do not — they are keyed by job UUID (`{job_id}/{bt_log_id}/{bt_photo_id}.jpg`).
   Delete the jobs and the files stay, costing money and pointing at nothing.
   Re-importing in place keeps job UUIDs stable, so all 10,957 photos stay attached.

3. **A wipe is blocked anyway.** `leads.converted_job_id -> jobs(id)` has no
   `ON DELETE` rule, so `DELETE FROM jobs` raises a foreign-key error the moment
   it hits a converted lead. Every one of the six active leads is converted.

The one thing a wipe would have given — a guaranteed-clean slate — is instead
handled by migration 050, which adds the missing unique constraints so re-import
is genuinely idempotent rather than duplicate-prone.

---

## Before you run anything

### 1. Apply migration 050 (required, one-off)

`supabase/migrations/050_bt_reimport_idempotency.sql`

This project has no `exec_sql` RPC, so `scripts/apply-migration.ts` cannot apply
it. Paste the file into the Supabase SQL editor:

https://supabase.com/dashboard/project/hdebklbhscvmdnatngkp/sql/new

It adds `schedule_items.bt_event_id` plus unique indexes on that,
`contacts.bt_contact_id` and `daily_logs.bt_log_id`. All three were verified
duplicate-free on the live DB first, so it applies without cleaning data.

It also changes `contacts.job_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL`.
That FK was harmless while `job_id` was NULL on every contact, but
`bt-link-job-contacts.ts` now populates it on 156 rows — and under CASCADE,
deleting a job would silently delete the client out of the company address book
without even tripping the 23503 guard in `src/app/api/jobs/[id]/route.ts`.
**Until 050 is applied, avoid deleting jobs through the UI.**

Why `daily_logs` needs it: migration 007 created a *partial* unique index
(`WHERE bt_log_id IS NOT NULL`). Postgres will not accept a partial index as an
`ON CONFLICT` target unless the statement repeats the predicate, which
supabase-js cannot express — so the upsert fails with error 42P10. 050 replaces
it with a plain unique index, which behaves identically here because Postgres
treats NULLs as distinct.

### 2. Log in to BuilderTrend (required, expires)

Both saved browser profiles are dead — `.bt-profile/` cookies are from 15 May,
`.bt-session/` from 27 May. Confirmed on 2026-09-23: a headless request to
`/app/Landing` redirects to the Auth0 login page and every API call fails.

The importers handle this — they open a headed Chromium and wait for you to log
in by hand, then reuse the session. But it means **no import can run unattended
the first time.** Log in once, then the rest of the run is automatic.

Credentials are in the jdc-platform memory dir (`user-app-credentials.md`).

---

## Run order

Order matters: `bt-seed.ts` creates the `migration@jdc-platform.internal` user
and populates `jobs.job_number`, which every later step joins on.

```bash
# 0. one-off: recover BT ids for the 4,110 schedule items seeded before
#    bt_event_id existed. 100% match rate, zero collisions (verified).
npx tsx scripts/bt-backfill-schedule-ids.ts           # dry run
npx tsx scripts/bt-backfill-schedule-ids.ts --apply

# 1. re-pull from BuilderTrend into bt-export/  (headed browser, log in when asked)
npx tsx scripts/bt-migrate.ts                         # jobs + calendar + photos + documents
npx tsx scripts/bt-migrate-missing.ts                 # daily logs + contacts (the working endpoints)
npx tsx scripts/bt-migrate-estimates.ts               # estimate worksheets + job costing budgets

# 2. load into Supabase
npx tsx scripts/bt-seed.ts                            # jobs (upsert job_number) + schedule (upsert bt_event_id)
npx tsx scripts/bt-sync-job-metadata.ts               # dry run: status/dates/tags diff
npx tsx scripts/bt-sync-job-metadata.ts --apply
npx tsx scripts/bt-seed-missing.ts                    # daily_logs + contacts
npx tsx scripts/bt-seed-attached-log-photos.ts        # photos (has retry/backoff; prefer over bt-seed-photos)
npm run bt:import                                     # time clock (upsert bt_shift_id)
npx tsx scripts/bt-seed-estimates.ts                  # dry run: per-job budget lines + totals
npx tsx scripts/bt-seed-estimates.ts --apply          # budget_lines (upsert job_id + bt_line_item_id)

# 3. link clients to jobs so crews can see a phone number
npx tsx scripts/bt-link-job-contacts.ts               # dry run + match report
npx tsx scripts/bt-link-job-contacts.ts --apply
```

---

## Known gaps

**Change orders and purchase orders are not a gap — ignore the 500s.**
`POST /api/ChangeOrders/Grid` and `POST /api/PurchaseOrders/Grid` return HTTP 500
for every job, on both the May and September extracts. JDC does not use either
module in BuilderTrend (confirmed by August, 2026-09-23), so there is nothing
there to export and nothing to recover. `bt-migrate.ts` still calls both and
still writes `{"_error":500}` for each; that is expected output, not a failure,
and the two empty BuildOS tables are correct. Do not spend time rediscovering
those endpoints.

BuildOS's own change-order feature is unaffected — it is a native module with
its own `CO-001` numbering, and it starts empty because JDC has never recorded
one anywhere.

**`bt-export/` on disk is from 14 May** — 859 MB, 238 job directories. Step 1
above refreshes it. If you skip step 1 you will load four-month-old data.

**`bt-seed.ts` trusts `isClosed`, which disagrees with `status`** on at least one
job. `bt-sync-job-metadata.ts` trusts `status` and is correct — which is why it
runs immediately after, to repair what the seeder got wrong.

**Estimates load as budgets, not BuildOS estimates.** Added 2026-09-24. Only 53
of 281 jobs have a BT estimate worksheet — JDC started using it recently — and
46 have real cost lines once selections are dropped: 598 lines, $1.36M. They go
into `budget_lines`, because BuildOS `estimate_lines` must hang off a lead and
must split unit cost into labor/material/sub, which BT does not carry. Worksheet
`lineItemType` 10 = cost line (loaded), 7 = allowance (loaded, cost backed out of
the client price), 5 = client selection from BT Selections (skipped — client
price, $0 cost, not a budget line). The job costing budget endpoint is used only
where its original budget disagrees with the worksheet (Tighe Garage, Ryan
Porch); for the other ~156 jobs it holds nothing but the "Buildertrend Flat
Rate" committed-cost bucket. BT cost-code ids are company-wide, so the key is
`(job_id, bt_line_item_id)` — a global key let one job's rows overwrite another's.

---

## Working endpoint inventory

| Entity | Endpoint | Status |
|---|---|---|
| Jobs | `POST /api/jobpicker/GetJobPickerData` | works |
| Daily logs | `POST /apix/v2/DailyLogs/grid` (`merge-patch+json`) | works |
| Contacts | `POST /api/Contacts/Grid` (paginate @200) | works per-job; 500 company-wide |
| Photos | `GET /api/Photos?jobId=&pageSize=5000` | works |
| Log photos | `GET /api/Photos?jobId=&logId=&pageSize=5000` | works |
| Calendar | `GET /api/Calendar?jobId=` | works |
| Documents | `GET /api/Documents?jobId=` | works |
| Time clock | `POST /api/TimeClock/Grid?gridType=29` | works |
| Estimate worksheet | `GET /api/Proposals/{jobId}/Worksheet` | works |
| Job costing budget | `POST /apix/v2/JobCostingBudget` (`{ jobId, filter }`) | works |
| Change orders | `POST /api/ChangeOrders/Grid` | 500 — module unused at JDC, nothing to export |
| Purchase orders | `POST /api/PurchaseOrders/Grid` | 500 — module unused at JDC, nothing to export |

Two traps worth knowing:

- `GET /api/Logs?jobId=` is capped and deprecated — use the `/apix/v2/` grid.
- `/app/builder/DailyLogs?jobId=` now 404s and can no longer be used to set the
  session's current job. Navigate to `/app/Landing` instead.

---

## Idempotency status after migration 050

| Table | Conflict key | Safe to re-run |
|---|---|---|
| `jobs` | `job_number` | yes |
| `schedule_items` | `bt_event_id` | yes (was: duplicated every run) |
| `daily_logs` | `bt_log_id` | yes (was: 42P10 on upsert) |
| `contacts` | `bt_contact_id` | yes (was: deduped in JS, racy) |
| `log_photos` | `bt_photo_id` | yes |
| `budget_lines` | `job_id, bt_line_item_id` | yes (migrations 052-053) |
| `time_entries` | `bt_shift_id` | yes |
| `cost_catalog` | `cost_code` | yes |
| `historical_estimates` | `estimate_ref` | yes |

Note that `bt-timeclock-import.ts` upserts with `ignoreDuplicates: true`, so a
re-run fills gaps but never updates a shift that changed in BT. Flip it to
`false` if BT time data gets corrected upstream.
